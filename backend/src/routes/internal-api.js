const { sequelize } = require('../config/database');
const { initModels } = require('../models');
const { buildInternalApiGuard } = require('../services/internal-api-auth');
const { isProjectAllowed, validateAllowedProjects } = require('../services/api-key-service');
const {
  createSendRequest,
  createSimpleContentSendRequest,
  approveSendRequestAndQueue,
  buildSendRequestIncludes,
} = require('../services/send-request-service');
const { recordAuditLog } = require('../services/audit-log-service');

function getModels() {
  return initModels(sequelize);
}

function getIdempotencyKey(request) {
  return request.headers['idempotency-key'] || request.body?.idempotencyKey || null;
}

function serializeInternalSendRequest(item) {
  const json = item.toJSON();
  const latestJob = Array.isArray(json.jobs) && json.jobs.length
    ? json.jobs.slice().sort((left, right) => new Date(right.queuedAt || 0) - new Date(left.queuedAt || 0))[0]
    : null;

  return {
    id: json.id,
    requestNo: json.requestNo,
    sourceProject: json.sourceProject,
    sourceType: json.sourceType,
    approvalStatus: json.approvalStatus,
    deliveryStatus: json.deliveryStatus,
    requestedAt: json.requestedAt,
    approvedAt: json.approvedAt,
    rejectedAt: json.rejectedAt,
    rejectionReason: json.rejectionReason,
    idempotencyKey: json.idempotencyKey,
    template: json.template ? {
      id: json.template.id,
      code: json.template.code,
      name: json.template.name,
      subject: json.template.subject,
    } : null,
    senderIdentity: json.senderIdentity ? {
      id: json.senderIdentity.id,
      name: json.senderIdentity.name,
      email: json.senderIdentity.email,
      replyToEmail: json.senderIdentity.replyToEmail,
    } : null,
    recipients: {
      to: json.toRecipients,
      cc: json.ccRecipients,
      bcc: json.bccRecipients,
    },
    attachments: (json.attachments || []).map((attachment) => ({
      id: attachment.id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      fileSizeBytes: attachment.fileSizeBytes,
    })),
    latestJob: latestJob ? {
      id: latestJob.id,
      status: latestJob.status,
      providerMessageId: latestJob.providerMessageId,
      lastError: latestJob.lastError,
      queuedAt: latestJob.queuedAt,
      startedAt: latestJob.startedAt,
      finishedAt: latestJob.finishedAt,
    } : null,
  };
}

function resolveSourceProject(apiKey, bodyProject) {
  const allowedProjects = validateAllowedProjects(apiKey.allowedProjects);

  if (bodyProject) {
    if (!isProjectAllowed(apiKey, bodyProject)) {
      throw new Error('API key is not allowed to use this project.');
    }
    return bodyProject;
  }

  const firstSpecificProject = allowedProjects.find((item) => item !== '*');
  if (firstSpecificProject) {
    return firstSpecificProject;
  }

  return 'default-project';
}

function shouldDirectSend(apiKey) {
  const scopes = Array.isArray(apiKey?.scopes) ? apiKey.scopes : [];
  return scopes.includes('send:direct');
}

async function findDuplicatedRequest(models, apiKeyId, sourceProject, idempotencyKey) {
  if (!idempotencyKey) {
    return null;
  }

  return models.SendRequest.findOne({
    where: {
      requestedViaApiKeyId: apiKeyId,
      sourceProject,
      idempotencyKey,
    },
    include: buildSendRequestIncludes(models),
    order: [['created_at', 'DESC']],
  });
}

async function logDuplicateHit(apiKey, requestItem, sourceProject, idempotencyKey, eventType) {
  await recordAuditLog({
    actorType: 'api_key',
    actorId: apiKey.id,
    actorLabel: apiKey.name,
    eventType,
    resourceType: 'send_request',
    resourceId: requestItem.id,
    status: 'success',
    message: `Internal API duplicate hit for ${requestItem.requestNo}.`,
    metadata: {
      sourceProject,
      idempotencyKey,
      keyPrefix: apiKey.keyPrefix,
    },
  });
}

async function loadFreshRequest(models, id) {
  return models.SendRequest.findByPk(id, {
    include: buildSendRequestIncludes(models),
  });
}

function normalizeSimpleSendBody(body = {}) {
  return {
    senderEmail: body.senderEmail || body.sender || body.from || '',
    subject: body.subject || body.title || '',
    toRecipients: body.toRecipients || body.to || body.recipient || '',
    content: body.content || '',
    contentType: body.contentType === 'text' ? 'text' : 'html',
  };
}

async function maybeAutoApproveSendRequest(models, apiKey, sendRequestId) {
  const deliveryMode = shouldDirectSend(apiKey) ? 'direct' : 'approval';

  if (deliveryMode === 'direct') {
    await approveSendRequestAndQueue({
      sendRequestId,
      comment: 'Auto-approved for trusted internal API direct send.',
    });
  }

  const fresh = await loadFreshRequest(models, sendRequestId);
  return { fresh, deliveryMode };
}

async function internalApiRoutes(app) {
  app.post('/internal-api/send-requests', {
    preHandler: buildInternalApiGuard(['send:create']),
  }, async (request, reply) => {
    const { apiKey } = request.internalApi;
    const body = request.body || {};
    const models = getModels();
    const idempotencyKey = getIdempotencyKey(request);

    let sourceProject;
    try {
      sourceProject = resolveSourceProject(apiKey, body.sourceProject);
    } catch (error) {
      return reply.status(403).send({ message: error.message });
    }

    if (!body.templateCode && !body.templateId) {
      return reply.status(400).send({ message: 'templateCode or templateId is required.' });
    }

    if (!body.toRecipients) {
      return reply.status(400).send({ message: 'toRecipients is required.' });
    }

    const existing = await findDuplicatedRequest(models, apiKey.id, sourceProject, idempotencyKey);
    if (existing) {
      await logDuplicateHit(apiKey, existing, sourceProject, idempotencyKey, 'internal_api_send_request_duplicate');
      return reply.send({
        duplicated: true,
        request: serializeInternalSendRequest(existing),
      });
    }

    try {
      const created = await createSendRequest({
        templateId: body.templateId,
        templateCode: body.templateCode,
        senderIdentityId: body.senderIdentityId,
        senderEmail: body.senderEmail,
        requestedViaApiKeyId: apiKey.id,
        sourceType: 'api',
        sourceProject,
        idempotencyKey,
        toRecipients: body.toRecipients,
        ccRecipients: body.ccRecipients,
        bccRecipients: body.bccRecipients,
        subjectOverride: body.subjectOverride,
        templatePayload: body.templatePayload,
        scheduledAt: body.scheduledAt,
        comment: body.comment || 'Send request created from internal API.',
      });

      const { fresh, deliveryMode } = await maybeAutoApproveSendRequest(models, apiKey, created.id);

      await recordAuditLog({
        actorType: 'api_key',
        actorId: apiKey.id,
        actorLabel: apiKey.name,
        eventType: 'internal_api_send_request_created',
        resourceType: 'send_request',
        resourceId: created.id,
        status: 'success',
        message: `Internal API created send request ${fresh.requestNo}.`,
        metadata: {
          sourceProject,
          idempotencyKey,
          keyPrefix: apiKey.keyPrefix,
          deliveryMode,
        },
      });

      return reply.status(202).send({
        duplicated: false,
        deliveryMode,
        request: serializeInternalSendRequest(fresh),
      });
    } catch (error) {
      await recordAuditLog({
        actorType: 'api_key',
        actorId: apiKey.id,
        actorLabel: apiKey.name,
        eventType: 'internal_api_send_request_failed',
        resourceType: 'send_request',
        status: 'error',
        message: error.message,
        metadata: {
          sourceProject,
          idempotencyKey,
          keyPrefix: apiKey.keyPrefix,
        },
      });
      return reply.status(400).send({ message: error.message });
    }
  });

  app.post('/internal-api/simple-send', {
    preHandler: buildInternalApiGuard(['send:create']),
  }, async (request, reply) => {
    const { apiKey } = request.internalApi;
    const body = normalizeSimpleSendBody(request.body || {});
    const models = getModels();
    const idempotencyKey = getIdempotencyKey(request);

    let sourceProject;
    try {
      sourceProject = resolveSourceProject(apiKey, request.body?.sourceProject);
    } catch (error) {
      return reply.status(403).send({ message: error.message });
    }

    if (!body.senderEmail || !body.subject || !body.toRecipients || !body.content) {
      return reply.status(400).send({
        message: 'senderEmail(or sender), subject(or title), toRecipients(or recipient) and content are required.',
      });
    }

    const existing = await findDuplicatedRequest(models, apiKey.id, sourceProject, idempotencyKey);
    if (existing) {
      await logDuplicateHit(apiKey, existing, sourceProject, idempotencyKey, 'internal_api_simple_send_duplicate');
      return reply.send({
        duplicated: true,
        request: serializeInternalSendRequest(existing),
      });
    }

    try {
      const created = await createSimpleContentSendRequest({
        senderEmail: body.senderEmail,
        requestedViaApiKeyId: apiKey.id,
        sourceType: 'api',
        sourceProject,
        idempotencyKey,
        toRecipients: body.toRecipients,
        subject: body.subject,
        content: body.content,
        contentType: body.contentType,
        comment: 'Simple send request created from internal API.',
      });

      const { fresh, deliveryMode } = await maybeAutoApproveSendRequest(models, apiKey, created.id);

      await recordAuditLog({
        actorType: 'api_key',
        actorId: apiKey.id,
        actorLabel: apiKey.name,
        eventType: 'internal_api_simple_send_created',
        resourceType: 'send_request',
        resourceId: created.id,
        status: 'success',
        message: `Internal API simple send created ${fresh.requestNo}.`,
        metadata: {
          sourceProject,
          idempotencyKey,
          keyPrefix: apiKey.keyPrefix,
          senderEmail: body.senderEmail,
          deliveryMode,
        },
      });

      return reply.status(202).send({
        duplicated: false,
        deliveryMode,
        request: serializeInternalSendRequest(fresh),
      });
    } catch (error) {
      await recordAuditLog({
        actorType: 'api_key',
        actorId: apiKey.id,
        actorLabel: apiKey.name,
        eventType: 'internal_api_simple_send_failed',
        resourceType: 'send_request',
        status: 'error',
        message: error.message,
        metadata: {
          sourceProject,
          idempotencyKey,
          keyPrefix: apiKey.keyPrefix,
          senderEmail: body.senderEmail,
        },
      });
      return reply.status(400).send({ message: error.message });
    }
  });

  app.get('/internal-api/send-requests/:requestNo', {
    preHandler: buildInternalApiGuard(['send:read']),
  }, async (request, reply) => {
    const { apiKey } = request.internalApi;
    const models = getModels();

    const item = await models.SendRequest.findOne({
      where: {
        requestNo: request.params.requestNo,
        sourceType: 'api',
      },
      include: buildSendRequestIncludes(models),
    });

    if (!item) {
      return reply.status(404).send({ message: 'Send request not found.' });
    }

    if (!isProjectAllowed(apiKey, item.sourceProject)) {
      return reply.status(403).send({ message: 'API key is not allowed to access this project.' });
    }

    await recordAuditLog({
      actorType: 'api_key',
      actorId: apiKey.id,
      actorLabel: apiKey.name,
      eventType: 'internal_api_send_request_read',
      resourceType: 'send_request',
      resourceId: item.id,
      status: 'success',
      message: `Internal API queried send request ${item.requestNo}.`,
      metadata: {
        sourceProject: item.sourceProject,
        keyPrefix: apiKey.keyPrefix,
      },
    });

    return reply.send({
      request: serializeInternalSendRequest(item),
    });
  });
}

module.exports = { internalApiRoutes };
