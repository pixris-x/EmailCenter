const { sequelize } = require('../config/database');
const { initModels } = require('../models');

function getModels() {
  return initModels(sequelize);
}

async function senderRoutes(app) {
  app.get('/sender-identities', async () => {
    const { SenderIdentity } = getModels();
    return SenderIdentity.findAll({ order: [['created_at', 'DESC']] });
  });

  app.post('/sender-identities', async (request, reply) => {
    const { SenderIdentity } = getModels();
    const body = request.body || {};

    if (!body.name || !body.email) {
      return reply.status(400).send({
        message: 'name and email are required.',
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

    return reply.status(201).send(item);
  });
}

module.exports = { senderRoutes };
