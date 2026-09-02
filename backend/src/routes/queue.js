const { sequelize } = require('../config/database');
const { initModels } = require('../models');
const { emailQueue, enqueueEmailJob } = require('../queues/email-queue');
const { consumeFixedWindowRateLimit } = require('../services/rate-limit-service');
const { recordAuditLog } = require('../services/audit-log-service');

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

// 失败/退信任务手动重试：创建一条新的 EmailJob 并重新入队（jobId 为新行 id，天然幂等）。
// 原失败任务保留为历史记录，便于审计与排查。
async function retryEmailJob(app) {
  app.post('/queue/jobs/:emailJobId/retry', async (request, reply) => {
    const { EmailJob, SendRequest } = getModels();
    const emailJobId = request.params.emailJobId;
    const emailJob = await EmailJob.findByPk(emailJobId);

    if (!emailJob) {
      return reply.status(404).send({ message: '邮件任务不存在。' });
    }

    if (emailJob.status !== 'failed') {
      return reply.status(400).send({
        message: `只有失败（failed）任务可以重试，当前状态：${emailJob.status}。`,
      });
    }

    const retryable = await EmailJob.findOne({
      where: { sendRequestId: emailJob.sendRequestId, status: ['pending', 'processing'] },
    });
    if (retryable) {
      return reply.status(400).send({ message: '该发送申请已有进行中的任务，请勿重复重试。' });
    }

    const sendRequest = await SendRequest.findByPk(emailJob.sendRequestId);
    if (!sendRequest) {
      return reply.status(404).send({ message: '关联的发送申请不存在。' });
    }

    const now = new Date();
    const newJob = await EmailJob.create({
      sendRequestId: emailJob.sendRequestId,
      queueName: 'email-send',
      provider: emailJob.provider || 'resend_smtp',
      status: 'pending',
      attempts: 0,
      maxAttempts: emailJob.maxAttempts || 3,
      queuedAt: now,
    });

    await sendRequest.update({
      deliveryStatus: 'queued',
      rejectionReason: null,
    });

    await enqueueEmailJob(
      {
        sendRequestId: emailJob.sendRequestId,
        emailJobId: newJob.id,
      },
      {
        delay: 0,
        jobId: newJob.id,
      },
    );

    await recordAuditLog({
      ...getAdminAuditMeta(request),
      eventType: 'email_job_retried',
      resourceType: 'email_job',
      resourceId: newJob.id,
      status: 'success',
      message: `邮件任务 ${emailJob.id} 重试成功，新任务 ${newJob.id} 已入队。`,
      metadata: {
        originalJobId: emailJob.id,
        sendRequestId: emailJob.sendRequestId,
        lastError: emailJob.lastError,
      },
    });

    return {
      message: '邮件任务已重新入队。',
      originalJobId: emailJob.id,
      retryJobId: newJob.id,
    };
  });
}

async function queueRoutes(app) {
  app.get('/queue/health', async () => ({
    status: 'ready',
    queue: 'email-send',
  }));

  await retryEmailJob(app);

  app.post('/queue/test', async (request, reply) => {
    const adminId = request.currentAdmin?.id || request.ip;
    try {
      await consumeFixedWindowRateLimit({
        key: `admin:queue-test:${adminId}`,
        limit: 20,
        windowSeconds: 60,
        label: '队列测试',
      });
    } catch (error) {
      return reply.status(error.statusCode || 429).send({ message: error.message });
    }

    const payload = {
      type: 'manual_test',
      triggeredAt: new Date().toISOString(),
      source: 'http-endpoint',
      ...request.body,
    };

    const job = await emailQueue.add('send-email', payload, {
      jobId: request.body?.jobId,
    });

    return reply.status(202).send({
      message: 'Test job queued successfully.',
      jobId: job.id,
      queueName: job.queueName,
    });
  });
}

module.exports = { queueRoutes };