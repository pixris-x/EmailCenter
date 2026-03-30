const { sequelize } = require('../config/database');
const { initModels } = require('../models');
const { verifyAdminPassword, signAdminAccessToken } = require('../services/auth-service');
const { recordAuditLog } = require('../services/audit-log-service');

function getModels() {
  return initModels(sequelize);
}

async function authRoutes(app) {
  app.post('/auth/login', async (request, reply) => {
    const { AdminUser } = getModels();
    const { email, password } = request.body || {};

    if (!email || !password) {
      return reply.status(400).send({ message: '邮箱和密码不能为空。' });
    }

    const adminUser = await AdminUser.findOne({
      where: { email },
    });

    if (!adminUser || adminUser.status !== 'active') {
      await recordAuditLog({
        actorType: 'anonymous',
        actorLabel: email,
        eventType: 'admin_login_failed',
        resourceType: 'admin_user',
        status: 'error',
        message: `管理员登录失败：${email}`,
      });
      return reply.status(401).send({ message: '账号或密码错误。' });
    }

    const passwordValid = await verifyAdminPassword(password, adminUser.passwordHash);
    if (!passwordValid) {
      await recordAuditLog({
        actorType: 'admin',
        actorId: adminUser.id,
        actorLabel: adminUser.email,
        eventType: 'admin_login_failed',
        resourceType: 'admin_user',
        resourceId: adminUser.id,
        status: 'error',
        message: `管理员登录失败：${adminUser.email}`,
      });
      return reply.status(401).send({ message: '账号或密码错误。' });
    }

    await adminUser.update({ lastLoginAt: new Date() });
    const accessToken = signAdminAccessToken(adminUser);

    await recordAuditLog({
      actorType: 'admin',
      actorId: adminUser.id,
      actorLabel: adminUser.email,
      eventType: 'admin_login_success',
      resourceType: 'admin_user',
      resourceId: adminUser.id,
      status: 'success',
      message: `管理员登录成功：${adminUser.email}`,
      metadata: {
        roleCode: adminUser.roleCode,
      },
    });

    return reply.send({
      accessToken,
      user: {
        id: adminUser.id,
        email: adminUser.email,
        displayName: adminUser.displayName,
        roleCode: adminUser.roleCode,
      },
    });
  });

  app.get('/auth/me', async (request) => {
    return {
      user: request.currentAdmin,
    };
  });
}

module.exports = { authRoutes };
