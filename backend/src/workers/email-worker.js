const { Worker } = require('bullmq');
const { env } = require('../config/env');
const { getRedisConnectionOptions } = require('../config/redis');
const { sequelize, isDatabaseConfigured } = require('../config/database');
const { initModels } = require('../models');
const { sendMailMessage } = require('../services/mail-service');
const { renderEmailTemplate } = require('../services/template-renderer');
const { resolveAttachmentAbsolutePath } = require('../services/attachment-service');

const models = initModels(sequelize);

async function createEmailLog(payload) {
  try {
    await models.EmailLog.create(payload);
  } catch (error) {
    console.error(`[email-worker] failed to persist email log: ${error.message}`);
  }
}

async function processEmailJob(job) {
  const attemptNumber = job.attemptsMade + 1;
  const maxAttempts = Number(job.opts.attempts || env.queue.emailMaxRetries);
  const emailJob = await models.EmailJob.findByPk(job.data.emailJobId);
  const sendRequest = await models.SendRequest.findByPk(job.data.sendRequestId, {
    include: [
      { model: models.EmailTemplate, as: 'template' },
      { model: models.SenderIdentity, as: 'senderIdentity' },
      { model: models.Attachment, as: 'attachments', required: false },
    ],
  });

  if (!emailJob) {
    throw new Error(`Email job ${job.data.emailJobId} not found.`);
  }

  if (!sendRequest) {
    throw new Error(`Send request ${job.data.sendRequestId} not found.`);
  }

  if (!sendRequest.template || !sendRequest.senderIdentity) {
    throw new Error('Send request is missing template or sender identity context.');
  }

  await emailJob.update({
    status: 'processing',
    startedAt: new Date(),
    finishedAt: null,
    attempts: attemptNumber,
    lastError: null,
  });

  await sendRequest.update({
    deliveryStatus: 'processing',
  });

  const rendered = renderEmailTemplate(
    sendRequest.template,
    sendRequest.templatePayload || {},
    sendRequest.subjectOverride,
  );

  // 附件在数据库里保存相对路径，发送时再解析为当前环境下的绝对路径。
  const attachments = (sendRequest.attachments || []).map((item) => ({
    filename: item.originalName,
    path: resolveAttachmentAbsolutePath(item.storagePath),
    contentType: item.mimeType,
  }));

  try {
    const result = await sendMailMessage({
      from: `${sendRequest.senderIdentity.name} <${sendRequest.senderIdentity.email}>`,
      replyTo: sendRequest.senderIdentity.replyToEmail || undefined,
      to: sendRequest.toRecipients,
      cc: sendRequest.ccRecipients,
      bcc: sendRequest.bccRecipients,
      subject: rendered.subject,
      html: rendered.htmlContent,
      text: rendered.textContent,
      attachments,
    });

    await emailJob.update({
      status: 'sent',
      providerMessageId: result.messageId,
      finishedAt: new Date(),
      attempts: attemptNumber,
      lastError: null,
    });

    await sendRequest.update({
      deliveryStatus: 'sent',
    });

    await createEmailLog({
      emailJobId: emailJob.id,
      sendRequestId: sendRequest.id,
      eventType: 'smtp_send_success',
      level: 'info',
      message: '邮件已通过 Resend SMTP 发送成功。',
      providerResponse: result,
    });

    return {
      status: 'sent',
      sendRequestId: sendRequest.id,
      messageId: result.messageId,
      accepted: result.accepted,
    };
  } catch (error) {
    const isFinalAttempt = attemptNumber >= maxAttempts;

    await emailJob.update({
      status: isFinalAttempt ? 'failed' : 'pending',
      finishedAt: new Date(),
      attempts: attemptNumber,
      lastError: error.message,
    });

    await sendRequest.update({
      deliveryStatus: isFinalAttempt ? 'failed' : 'queued',
    });

    await createEmailLog({
      emailJobId: emailJob.id,
      sendRequestId: sendRequest.id,
      eventType: 'smtp_send_failed',
      level: 'error',
      message: error.message,
      providerResponse: {
        attemptNumber,
        maxAttempts,
      },
    });

    throw error;
  }
}

const worker = new Worker(env.queue.emailName, processEmailJob, {
  connection: getRedisConnectionOptions(),
  concurrency: env.queue.emailConcurrency,
});

worker.on('ready', async () => {
  if (isDatabaseConfigured()) {
    try {
      await sequelize.authenticate();
      console.log('[email-worker] database connection initialized');
    } catch (error) {
      console.error(`[email-worker] database initialization failed: ${error.message}`);
    }
  }

  console.log(`[email-worker] listening on queue "${env.queue.emailName}" with concurrency ${env.queue.emailConcurrency}`);
});

worker.on('completed', (job, result) => {
  console.log(`[email-worker] completed job ${job.id}: ${JSON.stringify(result)}`);
});

worker.on('failed', (job, error) => {
  console.error(`[email-worker] failed job ${job?.id || 'unknown'}: ${error.message}`);
});

worker.on('error', (error) => {
  console.error(`[email-worker] worker error: ${error.message}`);
});

async function shutdown() {
  await worker.close();
  await sequelize.close().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
