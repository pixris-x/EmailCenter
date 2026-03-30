const Fastify = require('fastify');
const cors = require('@fastify/cors');
const multipart = require('@fastify/multipart');
const { createLoggerOptions } = require('./config/logger');
const { registerErrorHandler } = require('./plugins/error-handler');
const { registerRoutes } = require('./routes');
const { env } = require('./config/env');
const { verifyAdminAccessToken } = require('./services/auth-service');

function isPublicRequest(url = '') {
  return url.startsWith('/health')
    || url === '/auth/login'
    || url.startsWith('/internal-api');
}

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
    request.currentAdmin = verifyAdminAccessToken(token);
  } catch (error) {
    return reply.status(401).send({ message: '登录状态已失效，请重新登录。' });
  }
}

function buildApp() {
  const app = Fastify({
    logger: createLoggerOptions(),
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

  registerErrorHandler(app);
  registerRoutes(app);

  return app;
}

module.exports = { buildApp };
