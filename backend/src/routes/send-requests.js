const { sequelize } = require('../config/database');
const { initModels } = require('../models');
const { enqueueEmailJob } = require('../queues/email-queue');
const { createSendRequest, buildSendRequestIncludes } = require('../services/send-request-service');
const { recordAuditLog } = require('../services/audit-log-service');
const { parsePagination, buildPaginatedResponse } = require('../services/pagination-service');

function getModels() {
  return initModels(sequelize);
}

function getAdminAuditMeta(request) {
  return {
    actorType: 'admin',
    actorId: request.currentAdmin?.id || null,
    actorLabel: request.currentAdmin?.email || 'console',
  };
}

async function sendRequestRoutes(app) {
  app.get('/send-requests', async (request) => {
    const models = getModels();
    const pagination = parsePagination(request.query, { defaultPageSize: 10, maxPageSize: 50 });
    const result = await models.SendRequest.findAndCountAll({
      include: buildSendRequestIncludes(models),
      order: [['created_at', 'DESC']],
      distinct: true,
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

  app.get('/send-requests/pending-approval', async (request) => {
    const models = getModels();
    const pagination = parsePagination(request.query, { defaultPageSize: 8, maxPageSize: 50 });
    const result = await models.SendRequest.findAndCountAll({
      where: { approvalStatus: 'pending_approval' },
      include: buildSendRequestIncludes(models),
      order: [['created_at', 'ASC']],
      distinct: true,
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

  app.get('/send-requests/:id/approval-logs', async (request, reply) => {
    const { SendApprovalLog } = getModels();
    const logs = await SendApprovalLog.findAll({
      where: { sendRequestId: request.params.id },
      order: [['created_at', 'DESC']],
    });

    return reply.send(logs);
  });

  app.post('/send-requests', async (request, reply) => {
    const body = request.body || {};

    if (!body.templateId || !body.senderIdentityId || !body.toRecipients) {
      return reply.status(400).send({
        message: 'templateId、senderIdentityId 和 toRecipients 不能为空。',
      });
    }

    try {
      const item = await createSendRequest({
        templateId: body.templateId,
        senderIdentityId: body.senderIdentityId,
        requestedByAdminId: request.currentAdmin?.id || null,
        sourceType: body.sourceType || 'manual',
        sourceProject: body.sourceProject || null,
        toRecipients: body.toRecipients,
        ccRecipients: body.ccRecipients,
        bccRecipients: body.bccRecipients,
        subjectOverride: body.subjectOverride,
        templatePayload: body.templatePayload,
        scheduledAt: body.scheduledAt,
        comment: body.comment || '发送申请已创建，等待审批。',
      });

      await recordAuditLog({
        ...getAdminAuditMeta(request),
        eventType: 'send_request_created',
        resourceType: 'send_request',
        resourceId: item.id,
        status: 'success',
        message: `发送申请 ${item.requestNo} 创建成功。`,
        metadata: {
          sourceProject: item.sourceProject,
          sourceType: item.sourceType,
        },
      });

      return reply.status(201).send(item);
    } catch (error) {
      return reply.status(400).send({ message: error.message });
    }
  });

  app.post('/send-requests/:id/review', async (request, reply) => {
    const { SendRequest, SendApprovalLog, EmailJob } = getModels();
    const item = await SendRequest.findByPk(request.params.id);

    if (!item) {
      return reply.status(404).send({ message: '发送申请不存在。' });
    }

    const action = request.body?.action;
    const comment = request.body?.comment || null;

    if (!['approve', 'reject'].includes(action)) {
      return reply.status(400).send({ message: 'action 只能是 approve 或 reject。' });
    }

    if (action === 'approve') {
      await item.update({
        approvalStatus: 'approved',
        deliveryStatus: 'queued',
        approvedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
      });

      const jobRecord = await EmailJob.create({
        sendRequestId: item.id,
        queueName: 'email-send',
        provider: 'resend_smtp',
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        queuedAt: new Date(),
      });

      await enqueueEmailJob({
        sendRequestId: item.id,
        emailJobId: jobRecord.id,
      });
    }

    if (action === 'reject') {
      await item.update({
        approvalStatus: 'rejected',
        deliveryStatus: 'draft',
        rejectedAt: new Date(),
        rejectionReason: comment || '发送申请已驳回。',
      });
    }

    await SendApprovalLog.create({
      sendRequestId: item.id,
      reviewerAdminId: request.currentAdmin?.id || null,
      action,
      comment,
    });

    await recordAuditLog({
      ...getAdminAuditMeta(request),
      eventType: `send_request_${action}`,
      resourceType: 'send_request',
      resourceId: item.id,
      status: 'success',
      message: `发送申请 ${item.requestNo} 已${action === 'approve' ? '通过' : '驳回'}。`,
      metadata: {
        requestNo: item.requestNo,
        comment,
        deliveryStatus: item.deliveryStatus,
      },
    });

    return {
      message: `发送申请已${action === 'approve' ? '通过' : '驳回'}。`,
      sendRequestId: item.id,
      approvalStatus: item.approvalStatus,
      deliveryStatus: item.deliveryStatus,
    };
  });
}

module.exports = { sendRequestRoutes };
