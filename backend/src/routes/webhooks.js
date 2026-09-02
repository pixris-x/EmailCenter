const { env } = require('../config/env');
const { verifyWebhookSignature } = require('../services/webhook-signature');
const { ingestResendWebhookEvent } = require('../services/mail-feedback-service');

async function webhookRoutes(app) {
  // Resend 回执 webhook：公开路由（白名单见 app.js），需 Svix 签名校验。
  app.post('/webhooks/resend', async (request, reply) => {
    const rawBody = request.rawBody || '';
    const verification = verifyWebhookSignature({
      rawBody,
      headers: request.headers,
      secret: env.webhook.resendSecret,
      timestampTolerance: env.webhook.timestampToleranceSeconds,
    });

    if (!verification.valid) {
      request.log.warn({ reason: verification.reason }, 'Resend webhook signature verification failed');
      return reply.status(401).send({ message: 'Invalid webhook signature.' });
    }

    if (verification.reason === 'no-secret-configured') {
      request.log.warn('RESEND_WEBHOOK_SECRET not configured; accepting unsigned webhook (development only).');
    }

    const event = request.body || {};
    if (!event.type) {
      return reply.status(400).send({ message: 'Event type is required.' });
    }

    const summary = await ingestResendWebhookEvent({ event, rawBody });
    return reply.send({ received: true, summary });
  });
}

module.exports = { webhookRoutes };
