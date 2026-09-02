const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { initModels } = require('../models');
const { parsePagination, buildPaginatedResponse } = require('../services/pagination-service');

function getModels() {
  return initModels(sequelize);
}

function serializeEmailJob(item) {
  const json = item.toJSON();
  return {
    id: json.id,
    status: json.status,
    provider: json.provider,
    providerMessageId: json.providerMessageId,
    attempts: json.attempts,
    maxAttempts: json.maxAttempts,
    lastError: json.lastError,
    queuedAt: json.queuedAt,
    startedAt: json.startedAt,
    finishedAt: json.finishedAt,
    sendRequest: json.sendRequest ? {
      id: json.sendRequest.id,
      requestNo: json.sendRequest.requestNo,
      sourceProject: json.sendRequest.sourceProject,
      approvalStatus: json.sendRequest.approvalStatus,
      deliveryStatus: json.sendRequest.deliveryStatus,
      template: json.sendRequest.template ? {
        id: json.sendRequest.template.id,
        code: json.sendRequest.template.code,
        name: json.sendRequest.template.name,
      } : null,
      senderIdentity: json.sendRequest.senderIdentity ? {
        id: json.sendRequest.senderIdentity.id,
        name: json.sendRequest.senderIdentity.name,
        email: json.sendRequest.senderIdentity.email,
      } : null,
      requestedViaApiKey: json.sendRequest.requestedViaApiKey ? {
        id: json.sendRequest.requestedViaApiKey.id,
        name: json.sendRequest.requestedViaApiKey.name,
        keyPrefix: json.sendRequest.requestedViaApiKey.keyPrefix,
      } : null,
    } : null,
    logs: (json.logs || []).map((log) => ({
      id: log.id,
      eventType: log.eventType,
      level: log.level,
      message: log.message,
      providerResponse: log.providerResponse,
      createdAt: log.createdAt,
    })),
    feedbackEvents: (json.feedbackEvents || []).map((event) => ({
      id: event.id,
      kind: event.kind,
      statusCode: event.statusCode,
      reason: event.reason,
      receivedAt: event.receivedAt,
    })),
  };
}

function serializeReviewLog(log, reviewType) {
  const json = log.toJSON();
  return {
    id: json.id,
    reviewType,
    action: json.action,
    comment: json.comment,
    createdAt: json.createdAt,
    templateId: json.templateId || null,
    sendRequestId: json.sendRequestId || null,
  };
}

async function logRoutes(app) {
  app.get('/logs/overview', async () => {
    const { EmailJob, EmailLog, TemplateReviewLog, SendApprovalLog, AuditLog } = getModels();

    const [pendingApprovals, pendingReviews, failedJobs, emailLogCount, auditLogCount] = await Promise.all([
      sequelize.models.SendRequest.count({ where: { approvalStatus: 'pending_approval' } }),
      sequelize.models.EmailTemplate.count({ where: { status: 'pending_review' } }),
      EmailJob.count({ where: { status: 'failed' } }),
      EmailLog.count(),
      AuditLog.count(),
    ]);

    return {
      pendingApprovals,
      pendingReviews,
      failedJobs,
      emailLogCount,
      reviewLogCount: await Promise.all([
        TemplateReviewLog.count(),
        SendApprovalLog.count(),
      ]).then((values) => values[0] + values[1]),
      auditLogCount,
    };
  });

  app.get('/logs/email-jobs', async (request) => {
    const { EmailJob, SendRequest, EmailTemplate, SenderIdentity, EmailLog, ApiKey, MailFeedbackEvent } = getModels();
    const where = {};
    const pagination = parsePagination(request.query, { defaultPageSize: 8, maxPageSize: 50 });

    if (request.query?.status) {
      where.status = request.query.status;
    }

    if (request.query?.provider) {
      where.provider = request.query.provider;
    }

    const result = await EmailJob.findAndCountAll({
      where,
      include: [
        {
          model: SendRequest,
          as: 'sendRequest',
          include: [
            { model: EmailTemplate, as: 'template' },
            { model: SenderIdentity, as: 'senderIdentity' },
            { model: ApiKey, as: 'requestedViaApiKey', required: false },
          ],
        },
        {
          model: EmailLog,
          as: 'logs',
          required: false,
        },
        {
          model: MailFeedbackEvent,
          as: 'feedbackEvents',
          required: false,
        },
      ],
      order: [['created_at', 'DESC']],
      distinct: true,
      limit: pagination.limit,
      offset: pagination.offset,
    });

    return buildPaginatedResponse({
      rows: result.rows.map(serializeEmailJob),
      count: result.count,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
  });

  app.get('/logs/email-jobs/:id', async (request, reply) => {
    const { EmailJob, SendRequest, EmailTemplate, SenderIdentity, EmailLog, Attachment, ApiKey, MailFeedbackEvent } = getModels();
    const item = await EmailJob.findByPk(request.params.id, {
      include: [
        {
          model: SendRequest,
          as: 'sendRequest',
          include: [
            { model: EmailTemplate, as: 'template' },
            { model: SenderIdentity, as: 'senderIdentity' },
            { model: Attachment, as: 'attachments', required: false },
            { model: ApiKey, as: 'requestedViaApiKey', required: false },
          ],
        },
        {
          model: EmailLog,
          as: 'logs',
          required: false,
        },
        {
          model: MailFeedbackEvent,
          as: 'feedbackEvents',
          required: false,
        },
      ],
    });

    if (!item) {
      return reply.status(404).send({ message: 'Email job not found.' });
    }

    return serializeEmailJob(item);
  });

  app.get('/logs/reviews', async (request) => {
    const { TemplateReviewLog, SendApprovalLog } = getModels();
    const pagination = parsePagination(request.query, { defaultPageSize: 8, maxPageSize: 50 });
    const [templateTotal, sendTotal] = await Promise.all([
      TemplateReviewLog.count(),
      SendApprovalLog.count(),
    ]);
    const total = templateTotal + sendTotal;
    const fetchLimit = Math.min(total || pagination.pageSize, pagination.page * pagination.pageSize);

    const [templateLogs, sendLogs] = await Promise.all([
      TemplateReviewLog.findAll({
        order: [['created_at', 'DESC']],
        limit: fetchLimit,
      }),
      SendApprovalLog.findAll({
        order: [['created_at', 'DESC']],
        limit: fetchLimit,
      }),
    ]);

    const merged = [...templateLogs.map((item) => serializeReviewLog(item, 'template')), ...sendLogs.map((item) => serializeReviewLog(item, 'send_approval'))]
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

    const startIndex = (pagination.page - 1) * pagination.pageSize;
    return buildPaginatedResponse({
      rows: merged.slice(startIndex, startIndex + pagination.pageSize),
      count: total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
  });

  app.get('/logs/audit', async (request) => {
    const { AuditLog } = getModels();
    const where = {};
    const pagination = parsePagination(request.query, { defaultPageSize: 8, maxPageSize: 50 });

    if (request.query?.eventType) {
      where.eventType = request.query.eventType;
    }

    if (request.query?.resourceType) {
      where.resourceType = request.query.resourceType;
    }

    if (request.query?.status) {
      where.status = request.query.status;
    }

    if (request.query?.actorType) {
      where.actorType = request.query.actorType;
    }

    if (request.query?.q) {
      where[Op.or] = [
        { message: { [Op.iLike]: `%${request.query.q}%` } },
        { actorLabel: { [Op.iLike]: `%${request.query.q}%` } },
      ];
    }

    const result = await AuditLog.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset,
    });

    return buildPaginatedResponse({
      rows: result.rows,
      count: result.count,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
  });
}

module.exports = { logRoutes };
