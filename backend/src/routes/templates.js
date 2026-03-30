const { sequelize } = require('../config/database');
const { initModels } = require('../models');
const { renderTemplateContent } = require('../services/template-renderer');
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

function normalizeVariablesSchema(rawVariables = '') {
  if (!rawVariables) {
    return {};
  }

  if (typeof rawVariables === 'object') {
    return rawVariables;
  }

  return rawVariables
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((accumulator, item) => {
      accumulator[item] = {
        type: 'string',
        required: false,
      };
      return accumulator;
    }, {});
}

async function templateRoutes(app) {
  app.get('/template-categories', async () => {
    const { TemplateCategory } = getModels();
    return TemplateCategory.findAll({ order: [['created_at', 'DESC']] });
  });

  app.post('/template-categories', async (request, reply) => {
    const { TemplateCategory } = getModels();
    const { name, slug, description, status } = request.body || {};

    if (!name || !slug) {
      return reply.status(400).send({ message: '分类名称和标识不能为空。' });
    }

    const item = await TemplateCategory.create({
      name,
      slug,
      description: description || null,
      status: status || 'active',
    });

    return reply.status(201).send(item);
  });

  app.get('/templates', async () => {
    const { EmailTemplate, TemplateCategory, TemplateReviewLog } = getModels();
    return EmailTemplate.findAll({
      include: [
        { model: TemplateCategory, as: 'category' },
        { model: TemplateReviewLog, as: 'reviewLogs', required: false },
      ],
      order: [['created_at', 'DESC']],
    });
  });

  app.get('/templates/review-queue', async () => {
    const { EmailTemplate, TemplateCategory, TemplateReviewLog } = getModels();
    return EmailTemplate.findAll({
      where: { status: 'pending_review' },
      include: [
        { model: TemplateCategory, as: 'category' },
        { model: TemplateReviewLog, as: 'reviewLogs', required: false },
      ],
      order: [['updated_at', 'ASC']],
    });
  });

  app.get('/templates/:id/review-logs', async (request, reply) => {
    const { TemplateReviewLog } = getModels();
    const logs = await TemplateReviewLog.findAll({
      where: { templateId: request.params.id },
      order: [['created_at', 'DESC']],
    });

    return reply.send(logs);
  });

  app.post('/templates', async (request, reply) => {
    const { EmailTemplate } = getModels();
    const body = request.body || {};

    if (!body.name || !body.code || !body.subject || !body.htmlContent) {
      return reply.status(400).send({ message: '模板名称、编码、标题和 HTML 内容不能为空。' });
    }

    const item = await EmailTemplate.create({
      categoryId: body.categoryId || null,
      name: body.name,
      code: body.code,
      subject: body.subject,
      htmlContent: body.htmlContent,
      textContent: body.textContent || null,
      variablesSchema: normalizeVariablesSchema(body.variablesSchema),
      status: body.status || 'draft',
      createdByAdminId: request.currentAdmin?.id || null,
      updatedByAdminId: request.currentAdmin?.id || null,
    });

    return reply.status(201).send(item);
  });

  app.put('/templates/:id', async (request, reply) => {
    const { EmailTemplate } = getModels();
    const item = await EmailTemplate.findByPk(request.params.id);

    if (!item) {
      return reply.status(404).send({ message: '模板不存在。' });
    }

    const body = request.body || {};

    await item.update({
      categoryId: body.categoryId === '' ? null : (body.categoryId || item.categoryId),
      name: body.name || item.name,
      code: body.code || item.code,
      subject: body.subject || item.subject,
      htmlContent: body.htmlContent || item.htmlContent,
      textContent: body.textContent === undefined ? item.textContent : body.textContent,
      variablesSchema: body.variablesSchema ? normalizeVariablesSchema(body.variablesSchema) : item.variablesSchema,
      status: body.status || item.status,
      updatedByAdminId: request.currentAdmin?.id || null,
    });

    return item;
  });

  app.post('/templates/:id/submit-review', async (request, reply) => {
    const { EmailTemplate, TemplateReviewLog } = getModels();
    const item = await EmailTemplate.findByPk(request.params.id);

    if (!item) {
      return reply.status(404).send({ message: '模板不存在。' });
    }

    await item.update({
      status: 'pending_review',
      rejectedReason: null,
      updatedByAdminId: request.currentAdmin?.id || null,
    });

    await TemplateReviewLog.create({
      templateId: item.id,
      reviewerAdminId: request.currentAdmin?.id || null,
      action: 'submit_review',
      comment: request.body?.comment || '模板已提交审核。',
    });

    await recordAuditLog({
      ...getAdminAuditMeta(request),
      eventType: 'template_submitted_for_review',
      resourceType: 'email_template',
      resourceId: item.id,
      status: 'success',
      message: `模板 ${item.code} 已提交审核。`,
      metadata: {
        templateCode: item.code,
        templateName: item.name,
      },
    });

    return {
      message: '模板已提交审核。',
      templateId: item.id,
      status: item.status,
    };
  });

  app.post('/templates/:id/review', async (request, reply) => {
    const { EmailTemplate, TemplateReviewLog } = getModels();
    const item = await EmailTemplate.findByPk(request.params.id);

    if (!item) {
      return reply.status(404).send({ message: '模板不存在。' });
    }

    const action = request.body?.action;
    const comment = request.body?.comment || null;

    if (!['approve', 'reject'].includes(action)) {
      return reply.status(400).send({ message: 'action 只能是 approve 或 reject。' });
    }

    if (action === 'approve') {
      await item.update({
        status: 'approved',
        approvedAt: new Date(),
        rejectedReason: null,
        approvedByAdminId: request.currentAdmin?.id || null,
      });
    }

    if (action === 'reject') {
      await item.update({
        status: 'rejected',
        approvedAt: null,
        approvedByAdminId: null,
        rejectedReason: comment || '模板审核未通过。',
      });
    }

    await TemplateReviewLog.create({
      templateId: item.id,
      reviewerAdminId: request.currentAdmin?.id || null,
      action,
      comment,
    });

    await recordAuditLog({
      ...getAdminAuditMeta(request),
      eventType: `template_review_${action}`,
      resourceType: 'email_template',
      resourceId: item.id,
      status: 'success',
      message: `模板 ${item.code} 已${action === 'approve' ? '通过' : '驳回'}。`,
      metadata: {
        templateCode: item.code,
        templateName: item.name,
        comment,
      },
    });

    return {
      message: `模板已${action === 'approve' ? '通过' : '驳回'}。`,
      templateId: item.id,
      status: item.status,
    };
  });

  app.post('/templates/preview', async (request, reply) => {
    const body = request.body || {};

    if (!body.subject || !body.htmlContent) {
      return reply.status(400).send({ message: '预览时必须提供标题和 HTML 内容。' });
    }

    const payload = body.payload || {};

    return {
      subject: renderTemplateContent(body.subject, payload),
      htmlContent: renderTemplateContent(body.htmlContent, payload),
      textContent: renderTemplateContent(body.textContent || '', payload),
    };
  });
}

module.exports = {
  templateRoutes,
  normalizeVariablesSchema,
};
