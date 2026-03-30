const { sequelize } = require('../config/database');
const { initModels } = require('../models');

function getModels() {
  return initModels(sequelize);
}

async function recordAuditLog(payload) {
  try {
    const { AuditLog } = getModels();
    return await AuditLog.create({
      actorType: payload.actorType,
      actorId: payload.actorId || null,
      actorLabel: payload.actorLabel || null,
      eventType: payload.eventType,
      resourceType: payload.resourceType,
      resourceId: payload.resourceId || null,
      status: payload.status || 'success',
      message: payload.message,
      metadata: payload.metadata || {},
    });
  } catch (error) {
    console.error(`[audit-log] failed to persist audit log: ${error.message}`);
    return null;
  }
}

module.exports = {
  recordAuditLog,
};
