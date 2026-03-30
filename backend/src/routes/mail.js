const { verifySmtpConnection, sendTestEmail } = require('../services/mail-service');

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
    const to = request.body?.to;

    if (!to) {
      return reply.status(400).send({
        message: 'The "to" field is required.',
      });
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