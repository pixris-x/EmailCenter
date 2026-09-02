// Resend 回执 webhook 事件摄取：规范化事件 → 关联 email_jobs → 落库/更新状态 + 告警。
// Resend webhook 事件形如 { type: 'email.bounced', created_at, data: { email_id, message_id, from, to, subject, ... } }。

const { Op } = require('sequelize');
const { env } = require('../config/env');
const { sequelize } = require('../config/database');
const { initModels } = require('../models');
const { normalizeMessageId } = require('../utils/email-utils');
const { sendMailMessage } = require('./mail-service');

const EVENT_KIND = {
  'email.bounced': 'bounce',
  'email.complained': 'complaint',
  'email.delivered': 'delivered',
  'email.sent': 'sent',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
};

function getModels() {
  return initModels(sequelize);
}

function extractEventPayload(event) {
  const data = event.data || {};
  const rawTo = data.to ?? data.recipient ?? '';
  const recipients = []
    .concat(Array.isArray(rawTo) ? rawTo : [rawTo])
    .flatMap((item) => String(item || '').split(','))
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    type: String(event.type || ''),
    createdAt: event.created_at || data.created_at || new Date().toISOString(),
    messageId: data.message_id || data.messageId || data.email_id || data.emailId || '',
    recipients,
    subject: data.subject || '',
    reason: data.bounce?.reason
      || data.bounce?.description
      || data.reason
      || data.diagnostic_code
      || data.response
      || data.external_response
      || '',
    statusCode: data.bounce?.status
      || data.bounce?.code
      || data.delivery?.status
      || '',
    data,
  };
}

async function correlateJob(parsed) {
  const models = getModels();

  if (parsed.messageId) {
    const recentlySent = await models.EmailJob.findAll({
      where: { providerMessageId: { [Op.ne]: null } },
      attributes: ['id', 'sendRequestId', 'providerMessageId', 'status'],
      order: [['created_at', 'DESC']],
      limit: 5000,
    });

    const normalized = normalizeMessageId(parsed.messageId);
    const matched = recentlySent.find((job) => normalizeMessageId(job.providerMessageId) === normalized);
    if (matched) {
      return matched;
    }
  }

  const recipient = parsed.recipients[0];
  if (recipient) {
    const cut7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sendRequest = await models.SendRequest.findOne({
      where: {
        toRecipients: { [Op.contains]: [recipient] },
        created_at: { [Op.gte]: cut7d },
      },
      order: [['created_at', 'DESC']],
    });
    if (sendRequest) {
      return models.EmailJob.findOne({
        where: { sendRequestId: sendRequest.id },
        order: [['created_at', 'DESC']],
      });
    }
  }

  return null;
}

async function notifyAlert({ job, parsed, kind }) {
  if (!env.mail.alertTo) {
    return;
  }

  const models = getModels();
  const sendRequest = job ? await models.SendRequest.findByPk(job.sendRequestId) : null;
  const label = kind === 'bounce' ? '邮件退信' : '投诉反馈';

  try {
    await sendMailMessage({
      to: env.mail.alertTo,
      subject: `【Email Center】${label}告警${sendRequest ? ` ${sendRequest.requestNo}` : ''}`,
      text: [
        `Email Center 收到一份 ${label} 回执。`,
        sendRequest ? `发送申请：${sendRequest.requestNo}` : '',
        job ? `服务商消息 ID：${job.providerMessageId || '未知'}` : '',
        parsed.recipients.length ? `收件人：${parsed.recipients.join(', ')}` : '',
        parsed.statusCode ? `状态码：${parsed.statusCode}` : '',
        `原因：${parsed.reason || '未解析'}`,
        `时间：${parsed.createdAt}`,
      ].filter(Boolean).join('\n'),
    });
    console.log(`[webhook] alert sent to ${env.mail.alertTo} (${kind})`);
  } catch (error) {
    console.warn(`[webhook] failed to send alert: ${error.message}`);
  }
}

async function ingestResendWebhookEvent({ event, rawBody }) {
  const models = getModels();
  const parsed = extractEventPayload(event);
  const kind = EVENT_KIND[parsed.type] || null;

  if (!kind) {
    return { recognized: false, kind: null, matchedJobId: null };
  }

  const job = await correlateJob(parsed);
  const providerMessageId = job ? job.providerMessageId : (parsed.messageId || null);

  await models.MailFeedbackEvent.create({
    emailJobId: job ? job.id : null,
    providerMessageId,
    kind,
    statusCode: parsed.statusCode || null,
    reason: parsed.reason || null,
    rawContent: String(rawBody || '').slice(0, 2000) || null,
    receivedAt: new Date(parsed.createdAt) || new Date(),
  });

  if (!job) {
    console.warn(`[webhook] ${parsed.type} received but no matching email job (messageId=${parsed.messageId})`);
    return { recognized: true, kind, matchedJobId: null };
  }

  const now = new Date();

  if (kind === 'bounce') {
    await job.update({
      status: 'bounced',
      bouncedAt: now,
      bounceType: parsed.statusCode.startsWith('5') ? 'permanent' : 'transient',
      bounceReason: parsed.reason || null,
      finishedAt: job.finishedAt || now,
    });
    const sendRequest = await models.SendRequest.findByPk(job.sendRequestId);
    if (sendRequest && ['sent', 'queued', 'processing'].includes(sendRequest.deliveryStatus)) {
      await sendRequest.update({ deliveryStatus: 'bounced' });
    }
    await models.EmailLog.create({
      emailJobId: job.id,
      sendRequestId: job.sendRequestId,
      eventType: 'mail_bounce_received',
      level: 'error',
      message: `邮件退信：${parsed.reason || '无原因'}`,
      providerResponse: { statusCode: parsed.statusCode || null, reason: parsed.reason || null, eventType: parsed.type },
    });
    await notifyAlert({ job, parsed, kind });
  } else if (kind === 'delivered') {
    if (['sent', 'processing'].includes(job.status)) {
      await job.update({ status: 'delivered', deliveredAt: now, finishedAt: job.finishedAt || now });
    }
    const sendRequest = await models.SendRequest.findByPk(job.sendRequestId);
    if (sendRequest && sendRequest.deliveryStatus === 'sent') {
      await sendRequest.update({ deliveryStatus: 'delivered' });
    }
    await models.EmailLog.create({
      emailJobId: job.id,
      sendRequestId: job.sendRequestId,
      eventType: 'mail_delivered',
      level: 'info',
      message: '邮件已被收件方接收。',
      providerResponse: { eventType: parsed.type },
    });
  } else if (kind === 'complaint') {
    await models.EmailLog.create({
      emailJobId: job.id,
      sendRequestId: job.sendRequestId,
      eventType: 'mail_complaint_received',
      level: 'warn',
      message: '收到滥用/投诉反馈。',
      providerResponse: { reason: parsed.reason || null },
    });
    await notifyAlert({ job, parsed, kind });
  } else {
    await models.EmailLog.create({
      emailJobId: job.id,
      sendRequestId: job.sendRequestId,
      eventType: `mail_${kind}`,
      level: 'info',
      message: `邮件事件：${parsed.type}`,
      providerResponse: { eventType: parsed.type },
    });
  }

  return { recognized: true, kind, matchedJobId: job.id };
}

module.exports = {
  ingestResendWebhookEvent,
  extractEventPayload,
  normalizeMessageId,
};
