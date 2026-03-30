const { sequelize } = require('../config/database');
const { initModels } = require('../models');
const {
  createApiKeyRecord,
  serializeApiKey,
  validateApiKeyScopes,
  validateAllowedProjects,
} = require('../services/api-key-service');
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

async function apiKeyRoutes(app) {
  app.get('/api-keys', async () => {
    const { ApiKey } = getModels();
    const items = await ApiKey.findAll({
      order: [['created_at', 'DESC']],
    });

    return items.map((item) => serializeApiKey(item));
  });

  app.post('/api-keys', async (request, reply) => {
    const { ApiKey } = getModels();
    const body = request.body || {};

    if (!body.name) {
      return reply.status(400).send({ message: '密钥名称不能为空。' });
    }

    const allowedProjects = validateAllowedProjects(body.allowedProjects);
    if (!allowedProjects.length) {
      return reply.status(400).send({ message: '至少需要配置一个允许访问的项目。' });
    }

    const { item, plainTextKey } = await createApiKeyRecord(ApiKey, {
      name: body.name,
      scopes: validateApiKeyScopes(body.scopes),
      allowedProjects,
      expiresAt: body.expiresAt || null,
      createdByAdminId: request.currentAdmin?.id || null,
    });

    await recordAuditLog({
      ...getAdminAuditMeta(request),
      eventType: 'api_key_created',
      resourceType: 'api_key',
      resourceId: item.id,
      status: 'success',
      message: `接口密钥 ${item.name} 创建成功。`,
      metadata: {
        keyPrefix: item.keyPrefix,
        scopes: item.scopes,
        allowedProjects: item.allowedProjects,
      },
    });

    return reply.status(201).send(serializeApiKey(item, {
      includePlainTextKey: plainTextKey,
    }));
  });

  app.post('/api-keys/:id/revoke', async (request, reply) => {
    const { ApiKey } = getModels();
    const item = await ApiKey.findByPk(request.params.id);

    if (!item) {
      return reply.status(404).send({ message: '接口密钥不存在。' });
    }

    await item.update({
      status: 'revoked',
    });

    await recordAuditLog({
      ...getAdminAuditMeta(request),
      eventType: 'api_key_revoked',
      resourceType: 'api_key',
      resourceId: item.id,
      status: 'success',
      message: `接口密钥 ${item.name} 已吊销。`,
      metadata: {
        keyPrefix: item.keyPrefix,
      },
    });

    return reply.send({
      message: '接口密钥已吊销。',
      apiKey: serializeApiKey(item),
    });
  });
}

module.exports = { apiKeyRoutes };
