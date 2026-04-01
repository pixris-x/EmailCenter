const { authRoutes } = require('./auth');
const { healthRoutes } = require('./health');
const { queueRoutes } = require('./queue');
const { mailRoutes } = require('./mail');
const { templateRoutes } = require('./templates');
const { senderRoutes } = require('./senders');
const { sendRequestRoutes } = require('./send-requests');
const { attachmentRoutes } = require('./attachments');
const { apiKeyRoutes } = require('./api-keys');
const { internalApiRoutes } = require('./internal-api');
const { logRoutes } = require('./logs');
const { accessControlRoutes } = require('./access-control');

function registerRoutes(app) {
  healthRoutes(app);
  authRoutes(app);
  queueRoutes(app);
  mailRoutes(app);
  templateRoutes(app);
  senderRoutes(app);
  sendRequestRoutes(app);
  attachmentRoutes(app);
  apiKeyRoutes(app);
  internalApiRoutes(app);
  logRoutes(app);
  accessControlRoutes(app);
}

module.exports = { registerRoutes };
