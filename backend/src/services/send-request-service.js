const { sequelize } = require('../config/database');
const { initModels } = require('../models');

function getModels() {
  return initModels(sequelize);
}

function toRecipientArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function buildRequestNo() {
  return `SR${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function stripHtmlToText(value = '') {
  return String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveTemplate(models, payload) {
  let template = null;

  if (payload.templateId) {
    template = await models.EmailTemplate.findByPk(payload.templateId);
  }

  if (!template && payload.templateCode) {
    template = await models.EmailTemplate.findOne({
      where: { code: payload.templateCode },
    });
  }

  if (!template || template.status !== 'approved') {
    throw new Error('Only approved templates can be used for send requests.');
  }

  return template;
}

async function resolveSenderIdentity(models, payload) {
  let senderIdentity = null;

  if (payload.senderIdentityId) {
    senderIdentity = await models.SenderIdentity.findByPk(payload.senderIdentityId);
  }

  if (!senderIdentity && payload.senderEmail) {
    senderIdentity = await models.SenderIdentity.findOne({
      where: { email: payload.senderEmail },
    });
  }

  if (!senderIdentity) {
    senderIdentity = await models.SenderIdentity.findOne({
      where: { status: 'active', isDefault: true },
      order: [['created_at', 'DESC']],
    });
  }

  if (!senderIdentity) {
    senderIdentity = await models.SenderIdentity.findOne({
      where: { status: 'active' },
      order: [['created_at', 'DESC']],
    });
  }

  if (!senderIdentity || senderIdentity.status !== 'active') {
    throw new Error('Sender identity not found or inactive.');
  }

  return senderIdentity;
}

async function ensureSimpleContentTemplate(models, payload = {}) {
  let template = await models.EmailTemplate.findOne({
    where: { code: '__simple_content__' },
  });

  if (template) {
    if (template.status !== 'approved') {
      await template.update({
        status: 'approved',
        approvedAt: template.approvedAt || new Date(),
        approvedByAdminId: payload.approvedByAdminId || template.approvedByAdminId || null,
        rejectedReason: null,
      });
    }

    return template;
  }

  // 简化接口使用系统内置模板，这样外部项目只需传发送人、标题、收件人和正文。
  template = await models.EmailTemplate.create({
    categoryId: null,
    name: '系统简易邮件模板',
    code: '__simple_content__',
    subject: '{{title}}',
    htmlContent: '<div style="font-size:14px;line-height:1.8;color:#303133;">{{content}}</div>',
    textContent: '{{contentText}}',
    variablesSchema: {
      title: { type: 'string', required: true },
      content: { type: 'string', required: true },
      contentText: { type: 'string', required: false },
    },
    status: 'approved',
    createdByAdminId: payload.createdByAdminId || null,
    updatedByAdminId: payload.createdByAdminId || null,
    approvedByAdminId: payload.approvedByAdminId || null,
    approvedAt: new Date(),
  });

  return template;
}

async function createSendRequestWithResolvedTemplate(payload) {
  const models = getModels();
  const toRecipients = toRecipientArray(payload.toRecipients);

  if (!toRecipients.length) {
    throw new Error('At least one recipient is required.');
  }

  const template = payload.templateRecord || await resolveTemplate(models, payload);
  const senderIdentity = await resolveSenderIdentity(models, payload);

  return sequelize.transaction(async (transaction) => {
    const item = await models.SendRequest.create({
      requestNo: buildRequestNo(),
      templateId: template.id,
      senderIdentityId: senderIdentity.id,
      requestedByAdminId: payload.requestedByAdminId || null,
      requestedViaApiKeyId: payload.requestedViaApiKeyId || null,
      sourceType: payload.sourceType || 'manual',
      sourceProject: payload.sourceProject || null,
      idempotencyKey: payload.idempotencyKey || null,
      toRecipients,
      ccRecipients: toRecipientArray(payload.ccRecipients),
      bccRecipients: toRecipientArray(payload.bccRecipients),
      subjectOverride: payload.subjectOverride || null,
      templatePayload: payload.templatePayload || {},
      approvalStatus: 'pending_approval',
      deliveryStatus: 'draft',
      scheduledAt: payload.scheduledAt || null,
    }, { transaction });

    await models.SendApprovalLog.create({
      sendRequestId: item.id,
      reviewerAdminId: null,
      action: 'submit',
      comment: payload.comment || 'Send request created and waiting for approval.',
    }, { transaction });

    return item;
  });
}

async function createSendRequest(payload) {
  return createSendRequestWithResolvedTemplate(payload);
}

async function createSimpleContentSendRequest(payload) {
  if (!payload.subject) {
    throw new Error('Subject is required.');
  }

  if (!payload.content) {
    throw new Error('Content is required.');
  }

  const models = getModels();
  const template = await ensureSimpleContentTemplate(models, {
    createdByAdminId: payload.requestedByAdminId || null,
    approvedByAdminId: payload.requestedByAdminId || null,
  });

  const normalizedText = payload.contentType === 'text'
    ? String(payload.content)
    : (stripHtmlToText(payload.content) || String(payload.content));

  return createSendRequestWithResolvedTemplate({
    ...payload,
    templateRecord: template,
    subjectOverride: payload.subject,
    templatePayload: {
      title: payload.subject,
      content: payload.content,
      contentText: normalizedText,
    },
  });
}

function buildSendRequestIncludes(models) {
  return [
    { model: models.EmailTemplate, as: 'template' },
    { model: models.SenderIdentity, as: 'senderIdentity' },
    { model: models.SendApprovalLog, as: 'approvalLogs', required: false },
    { model: models.Attachment, as: 'attachments', required: false },
    { model: models.EmailJob, as: 'jobs', required: false },
  ];
}

module.exports = {
  toRecipientArray,
  buildRequestNo,
  createSendRequest,
  createSimpleContentSendRequest,
  buildSendRequestIncludes,
  resolveTemplate,
  resolveSenderIdentity,
  ensureSimpleContentTemplate,
};
