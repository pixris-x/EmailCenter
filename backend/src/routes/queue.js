const { emailQueue } = require('../queues/email-queue');

async function queueRoutes(app) {
  app.get('/queue/health', async () => ({
    status: 'ready',
    queue: 'email-send',
  }));

  app.post('/queue/test', async (request, reply) => {
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