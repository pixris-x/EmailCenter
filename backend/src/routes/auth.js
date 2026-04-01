const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');
const { initModels } = require('../models');
const { verifyAdminPassword, signAdminAccessToken } = require('../services/auth-service');
const { recordAuditLog } = require('../services/audit-log-service');
const { serializeAdminUser } = require('../services/permission-service');

function getModels() {
  return initModels(sequelize);
}

async function authRoutes(app) {
  app.post('/auth/login', async (request, reply) => {
    const { AdminUser, RolePermission } = getModels();
    const { email, password } = request.body || {};

    if (!email || !password) {
      return reply.status(400).send({ message: '邮箱和密码不能为空。' });
    }

    const adminUser = await AdminUser.findOne({
      where: { email },
      include: [
        { model: RolePermission, as: 'rolePermission' },
      ],
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
    const user = serializeAdminUser(adminUser);

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
      user,
    });
  });

  app.post('/auth/change-password', async (request, reply) => {
    const { AdminUser, RolePermission } = getModels();
    const currentAdmin = request.currentAdmin;
    const { currentPassword, newPassword } = request.body || {};

    if (!currentAdmin?.id) {
      return reply.status(401).send({ message: '请先登录管理员账号。' });
    }

    if (!currentPassword || !newPassword) {
      return reply.status(400).send({ message: '当前密码和新密码不能为空。' });
    }

    if (String(newPassword).trim().length < 6) {
      return reply.status(400).send({ message: '新密码长度不能少于 6 位。' });
    }

    const adminUser = await AdminUser.findByPk(currentAdmin.id, {
      include: [
        { model: RolePermission, as: 'rolePermission' },
      ],
    });

    if (!adminUser || adminUser.status !== 'active') {
      return reply.status(404).send({ message: '管理员账号不存在或已停用。' });
    }

    const passwordValid = await verifyAdminPassword(currentPassword, adminUser.passwordHash);
    if (!passwordValid) {
      await recordAuditLog({
        actorType: 'admin',
        actorId: adminUser.id,
        actorLabel: adminUser.email,
        eventType: 'admin_password_change_failed',
        resourceType: 'admin_user',
        resourceId: adminUser.id,
        status: 'error',
        message: `管理员修改密码失败：${adminUser.email}`,
      });
      return reply.status(400).send({ message: '当前密码不正确。' });
    }

    adminUser.passwordHash = await bcrypt.hash(newPassword, 10);
    await adminUser.save();

    await recordAuditLog({
      actorType: 'admin',
      actorId: adminUser.id,
      actorLabel: adminUser.email,
      eventType: 'admin_password_changed',
      resourceType: 'admin_user',
      resourceId: adminUser.id,
      status: 'success',
      message: `管理员已修改自己的登录密码：${adminUser.email}`,
      metadata: {
        roleCode: adminUser.roleCode,
      },
    });

    return reply.send({
      message: '登录密码已更新。',
    });
  });

  app.get('/auth/me', async (request) => {
    return {
      user: request.currentAdmin,
    };
  });
}

module.exports = { authRoutes };
