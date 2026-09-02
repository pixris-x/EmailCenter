const Fastify = require('fastify');
const cors = require('@fastify/cors');
const multipart = require('@fastify/multipart');
const { Readable } = require('node:stream');
const { createLoggerOptions } = require('./config/logger');
const { registerErrorHandler } = require('./plugins/error-handler');
const { registerRoutes } = require('./routes');
const { env } = require('./config/env');
const { verifyAdminAccessToken } = require('./services/auth-service');
const { sequelize } = require('./config/database');
const { initModels } = require('./models');
const { serializeAdminUser } = require('./services/permission-service');

function isPublicRequest(url = '') {
  return url.startsWith('/health')
    || url === '/auth/login'
    || url.startsWith('/internal-api')
    || url.startsWith('/webhooks');
}

// 每次请求都从数据库取当前管理员，保证状态与角色权限即时生效。
async function attachCurrentAdmin(request, reply) {
  if (request.method === 'OPTIONS' || isPublicRequest(request.url)) {
    return;
  }

  const authorization = request.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) {
    return reply.status(401).send({ message: '请先登录管理员账号。' });
  }

  const token = authorization.slice('Bearer '.length).trim();

  try {
    const payload = verifyAdminAccessToken(token);
    const { AdminUser, RolePermission } = initModels(sequelize);
    const adminUser = await AdminUser.findByPk(payload.adminId, {
      include: [
        { model: RolePermission, as: 'rolePermission' },
      ],
    });

    if (!adminUser || adminUser.status !== 'active') {
      return reply.status(401).send({ message: '登录状态已失效，请重新登录。' });
    }

    request.currentAdmin = serializeAdminUser(adminUser);
  } catch {
    return reply.status(401).send({ message: '登录状态已失效，请重新登录。' });
  }
}

function buildApp() {
  const app = Fastify({
    logger: createLoggerOptions(),
    // 生产环境经 Nginx 反代，开启后 request.ip 取真实客户端 IP（用于登录防爆破）。
    trustProxy: true,
  });

  app.decorateRequest('currentAdmin', null);

  app.register(cors, {
    origin: [env.app.webUrl, env.app.baseUrl],
    credentials: true,
  });

  app.register(multipart, {
    limits: {
      files: 1,
      fileSize: env.smtp.attachmentMaxMb * 1024 * 1024,
    },
  });

  app.addHook('onRequest', attachCurrentAdmin);

  // Webhook 需要原始请求体做签名校验，同时保留给 fastify 正常 JSON 解析。
  app.addHook('preParsing', (request, reply, payload, done) => {
    if (!request.url || !request.url.startsWith('/webhooks/resend')) {
      return done(null, payload);
    }

    const chunks = [];
    payload.on('data', (chunk) => chunks.push(chunk));
    payload.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      request.rawBody = raw;
      done(null, Readable.from([Buffer.from(raw)]));
    });
    payload.on('error', done);
  });

  registerErrorHandler(app);
  registerRoutes(app);

  return app;
}

module.exports = { buildApp };
