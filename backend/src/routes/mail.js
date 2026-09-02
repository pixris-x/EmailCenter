const { verifySmtpConnection, sendTestEmail } = require('../services/mail-service');
const { validateRecipientList } = require('../utils/email-utils');
const { consumeFixedWindowRateLimit } = require('../services/rate-limit-service');

async function mailRoutes(app) {
  app.get('/mail/health', async (request, reply) => {
    try {
      const result = await verifySmtpConnection();
      return {
        status: 'ok',
        smtp: result,
      };
    } catch (error) {
      request.log.error({ err: error }, 'SMTP verification failed');
      return reply.status(503).send({
        status: 'error',
        message: error.message,
      });
    }
  });

  app.post('/mail/test', async (request, reply) => {
    const adminId = request.currentAdmin?.id || request.ip;
    try {
      await consumeFixedWindowRateLimit({
        key: `admin:mail-test:${adminId}`,
        limit: 10,
        windowSeconds: 60,
        label: '测试发信',
      });
    } catch (error) {
      return reply.status(error.statusCode || 429).send({ message: error.message });
    }

    const to = request.body?.to;

    if (!to) {
      return reply.status(400).send({
        message: 'The "to" field is required.',
      });
    }

    try {
      validateRecipientList(to, { field: 'to' });
    } catch (error) {
      return reply.status(400).send({ message: error.message });
    }

    try {
      const result = await sendTestEmail({
        to,
        subject: request.body?.subject,
        html: request.body?.html,
        text: request.body?.text,
      });

      return reply.status(202).send({
        message: 'Test email sent successfully.',
        result,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Test email send failed');
      return reply.status(502).send({
        message: error.message,
      });
    }
  });
}

module.exports = { mailRoutes };