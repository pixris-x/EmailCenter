const { pingRedis } = require('../config/redis');

async function healthRoutes(app) {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'email-center-backend',
    timestamp: new Date().toISOString(),
  }));

  app.get('/health/redis', async (request, reply) => {
    try {
      const response = await pingRedis();

      return {
        status: 'ok',
        redis: response,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      request.log.error({ err: error }, 'Redis health check failed');
      return reply.status(503).send({
        status: 'error',
        message: error.message,
      });
    }
  });
}

module.exports = { healthRoutes };