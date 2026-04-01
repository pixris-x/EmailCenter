const { sequelize } = require('../config/database');
const { initModels } = require('../models');
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

function toPositiveInt(value, fallback, maximum = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), maximum);
}

function serializeSenderIdentity(item, extra = {}) {
  const json = item.toJSON();
  return {
    id: json.id,
    name: json.name,
    email: json.email,
    replyToEmail: json.replyToEmail,
    provider: json.provider,
    status: json.status,
    isDefault: json.isDefault,
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
    ...extra,
  };
}

async function senderRoutes(app) {
  app.get('/sender-identities', async (request) => {
    const { SenderIdentity, SendRequest } = getModels();
    const query = request.query || {};

    if (String(query.all || '').toLowerCase() === 'true') {
      const items = await SenderIdentity.findAll({
        order: [['created_at', 'DESC']],
      });

      return {
        items: items.map((item) => serializeSenderIdentity(item)),
        total: items.length,
        page: 1,
        pageSize: items.length || 0,
      };
    }

    const page = toPositiveInt(query.page, 1, 100000);
    const pageSize = toPositiveInt(query.pageSize, 5, 50);
    const offset = (page - 1) * pageSize;

    const { count, rows } = await SenderIdentity.findAndCountAll({
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset,
    });

    const items = await Promise.all(rows.map(async (item) => {
      const usageCount = await SendRequest.count({
        where: { senderIdentityId: item.id },
      });

      return serializeSenderIdentity(item, { usageCount });
    }));

    return {
      items,
      total: count,
      page,
      pageSize,
    };
  });

  app.get('/sender-identities/:id', async (request, reply) => {
    const { SenderIdentity, SendRequest, EmailTemplate } = getModels();
    const item = await SenderIdentity.findByPk(request.params.id);

    if (!item) {
      return reply.status(404).send({ message: '发件人不存在。' });
    }

    const usageCount = await SendRequest.count({
      where: { senderIdentityId: item.id },
    });

    const recentSendRequests = await SendRequest.findAll({
      where: { senderIdentityId: item.id },
      include: [
        { model: EmailTemplate, as: 'template' },
      ],
      order: [['requested_at', 'DESC']],
      limit: 5,
    });

    return reply.send({
      sender: serializeSenderIdentity(item, {
        usageCount,
        recentSendRequests: recentSendRequests.map((requestItem) => ({
          id: requestItem.id,
          requestNo: requestItem.requestNo,
          approvalStatus: requestItem.approvalStatus,
          deliveryStatus: requestItem.deliveryStatus,
          requestedAt: requestItem.requestedAt,
          template: requestItem.template ? {
            id: requestItem.template.id,
            name: requestItem.template.name,
            code: requestItem.template.code,
          } : null,
        })),
      }),
    });
  });

  app.post('/sender-identities', async (request, reply) => {
    const { SenderIdentity } = getModels();
    const body = request.body || {};

    if (!body.name || !body.email) {
      return reply.status(400).send({
        message: '发件人名称和邮箱不能为空。',
      });
    }

    const item = await SenderIdentity.create({
      name: body.name,
      email: body.email,
      replyToEmail: body.replyToEmail || null,
      provider: 'resend_smtp',
      status: body.status || 'active',
      isDefault: Boolean(body.isDefault),
    });

    await recordAuditLog({
      ...getAdminAuditMeta(request),
      eventType: 'sender_identity_created',
      resourceType: 'sender_identity',
      resourceId: item.id,
      status: 'success',
      message: `发件人 ${item.email} 创建成功。`,
      metadata: {
        senderEmail: item.email,
        senderName: item.name,
      },
    });

    return reply.status(201).send(serializeSenderIdentity(item, { usageCount: 0 }));
  });

  app.put('/sender-identities/:id', async (request, reply) => {
    const { SenderIdentity } = getModels();
    const item = await SenderIdentity.findByPk(request.params.id);

    if (!item) {
      return reply.status(404).send({ message: '\u53d1\u4ef6\u4eba\u4e0d\u5b58\u5728\u3002' });
    }

    const nextName = String(request.body?.name || '').trim();
    if (!nextName) {
      return reply.status(400).send({ message: '\u53d1\u4ef6\u4eba\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a\u3002' });
    }

    item.name = nextName;
    await item.save();

    await recordAuditLog({
      ...getAdminAuditMeta(request),
      eventType: 'sender_identity_updated',
      resourceType: 'sender_identity',
      resourceId: item.id,
      status: 'success',
      message: `发件人 ${item.email} 更新成功。`,
      metadata: {
        senderEmail: item.email,
        senderName: item.name,
      },
    });

    return reply.send(serializeSenderIdentity(item));
  });

  app.delete('/sender-identities/:id', async (request, reply) => {
    const { SenderIdentity, SendRequest } = getModels();
    const item = await SenderIdentity.findByPk(request.params.id);

    if (!item) {
      return reply.status(404).send({ message: '发件人不存在。' });
    }

    const usageCount = await SendRequest.count({
      where: { senderIdentityId: item.id },
    });

    if (usageCount > 0) {
      return reply.status(409).send({
        message: '该发件人已被发送申请使用，暂时不能删除。',
      });
    }

    const senderEmail = item.email;
    const senderName = item.name;
    const senderId = item.id;
    await item.destroy();

    await recordAuditLog({
      ...getAdminAuditMeta(request),
      eventType: 'sender_identity_deleted',
      resourceType: 'sender_identity',
      resourceId: senderId,
      status: 'success',
      message: `发件人 ${senderEmail} 已删除。`,
      metadata: {
        senderEmail,
        senderName,
      },
    });

    return reply.send({
      message: '发件人删除成功。',
    });
  });
}

module.exports = { senderRoutes };


