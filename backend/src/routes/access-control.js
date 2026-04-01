const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');
const { initModels } = require('../models');
const { recordAuditLog } = require('../services/audit-log-service');
const {
  PERMISSION_GROUPS,
  normalizePermissions,
  ensurePermission,
  serializeRolePermission,
  serializeAdminUser,
} = require('../services/permission-service');
const { parsePagination, buildPaginatedResponse, isAllQuery } = require('../services/pagination-service');

function getModels() {
  return initModels(sequelize);
}

function getAdminAuditMeta(request) {
  return {
    actorType: 'admin',
    actorId: request.currentAdmin?.id || null,
    actorLabel: request.currentAdmin?.email || 'console',
  };
}

async function buildRoleUsageMap(AdminUser) {
  const rows = await AdminUser.findAll({
    attributes: [
      'roleCode',
      [sequelize.fn('COUNT', sequelize.col('id')), 'adminUserCount'],
    ],
    group: ['roleCode'],
    raw: true,
  });

  return rows.reduce((accumulator, item) => {
    accumulator[item.roleCode] = Number(item.adminUserCount || 0);
    return accumulator;
  }, {});
}

async function accessControlRoutes(app) {
  app.get('/permissions/catalog', async (request, reply) => {
    if (!ensurePermission(request, reply, 'auth_admins:manage')) {
      return;
    }

    return {
      groups: PERMISSION_GROUPS,
    };
  });

  app.get('/roles', async (request, reply) => {
    if (!ensurePermission(request, reply, 'auth_admins:manage')) {
      return;
    }

    const { RolePermission, AdminUser } = getModels();
    const usageMap = await buildRoleUsageMap(AdminUser);

    if (isAllQuery(request.query)) {
      const roles = await RolePermission.findAll({
        order: [['created_at', 'ASC']],
      });

      return {
        items: roles.map((role) => serializeRolePermission(role, {
          adminUserCount: usageMap[role.roleCode] || 0,
        })),
      };
    }

    const pagination = parsePagination(request.query, { defaultPageSize: 8, maxPageSize: 50 });
    const result = await RolePermission.findAndCountAll({
      order: [['created_at', 'ASC']],
      limit: pagination.limit,
      offset: pagination.offset,
    });

    return buildPaginatedResponse({
      rows: result.rows.map((role) => serializeRolePermission(role, {
        adminUserCount: usageMap[role.roleCode] || 0,
      })),
      count: result.count,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
  });

  app.post('/roles', async (request, reply) => {
    if (!ensurePermission(request, reply, 'auth_admins:manage')) {
      return;
    }

    const { RolePermission } = getModels();
    const body = request.body || {};

    if (!body.roleCode || !body.roleName) {
      return reply.status(400).send({ message: '角色编码和角色名称不能为空。' });
    }

    const existing = await RolePermission.findOne({ where: { roleCode: body.roleCode } });
    if (existing) {
      return reply.status(400).send({ message: '角色编码已存在。' });
    }

    const role = await RolePermission.create({
      roleCode: body.roleCode,
      roleName: body.roleName,
      permissions: normalizePermissions(body.permissions),
      description: body.description || '',
    });

    await recordAuditLog({
      ...getAdminAuditMeta(request),
      eventType: 'role_created',
      resourceType: 'role_permission',
      resourceId: role.id,
      status: 'success',
      message: `角色 ${role.roleCode} 创建成功。`,
      metadata: {
        roleCode: role.roleCode,
      },
    });

    return reply.status(201).send(serializeRolePermission(role));
  });

  app.put('/roles/:id', async (request, reply) => {
    if (!ensurePermission(request, reply, 'auth_admins:manage')) {
      return;
    }

    const { RolePermission } = getModels();
    const body = request.body || {};
    const role = await RolePermission.findByPk(request.params.id);

    if (!role) {
      return reply.status(404).send({ message: '角色不存在。' });
    }

    if (role.roleCode === 'super_admin') {
      await role.update({
        roleName: body.roleName || role.roleName,
        description: body.description === undefined ? role.description : body.description,
        permissions: ['*'],
      });
    } else {
      await role.update({
        roleName: body.roleName || role.roleName,
        description: body.description === undefined ? role.description : body.description,
        permissions: normalizePermissions(body.permissions),
      });
    }

    await recordAuditLog({
      ...getAdminAuditMeta(request),
      eventType: 'role_updated',
      resourceType: 'role_permission',
      resourceId: role.id,
      status: 'success',
      message: `角色 ${role.roleCode} 已更新。`,
      metadata: {
        roleCode: role.roleCode,
      },
    });

    return serializeRolePermission(role);
  });

  app.get('/admin-users', async (request, reply) => {
    if (!ensurePermission(request, reply, 'auth_admins:manage')) {
      return;
    }

    const { AdminUser, RolePermission } = getModels();
    const pagination = parsePagination(request.query, { defaultPageSize: 8, maxPageSize: 50 });
    const result = await AdminUser.findAndCountAll({
      include: [
        { model: RolePermission, as: 'rolePermission' },
      ],
      order: [['created_at', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset,
    });

    return buildPaginatedResponse({
      rows: result.rows.map((item) => serializeAdminUser(item)),
      count: result.count,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
  });

  app.post('/admin-users', async (request, reply) => {
    if (!ensurePermission(request, reply, 'auth_admins:manage')) {
      return;
    }

    const { AdminUser, RolePermission } = getModels();
    const body = request.body || {};

    if (!body.email || !body.displayName || !body.password || !body.roleCode) {
      return reply.status(400).send({ message: '邮箱、显示名称、初始密码和角色不能为空。' });
    }

    const role = await RolePermission.findOne({ where: { roleCode: body.roleCode } });
    if (!role) {
      return reply.status(400).send({ message: '角色不存在。' });
    }

    const existing = await AdminUser.findOne({ where: { email: body.email } });
    if (existing) {
      return reply.status(400).send({ message: '管理员邮箱已存在。' });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const adminUser = await AdminUser.create({
      email: body.email,
      displayName: body.displayName,
      passwordHash,
      status: body.status || 'active',
      roleCode: body.roleCode,
    });

    const createdUser = await AdminUser.findByPk(adminUser.id, {
      include: [
        { model: RolePermission, as: 'rolePermission' },
      ],
    });

    await recordAuditLog({
      ...getAdminAuditMeta(request),
      eventType: 'admin_user_created',
      resourceType: 'admin_user',
      resourceId: adminUser.id,
      status: 'success',
      message: `管理员 ${adminUser.email} 创建成功。`,
      metadata: {
        email: adminUser.email,
        roleCode: adminUser.roleCode,
      },
    });

    return reply.status(201).send(serializeAdminUser(createdUser));
  });

  app.put('/admin-users/:id', async (request, reply) => {
    if (!ensurePermission(request, reply, 'auth_admins:manage')) {
      return;
    }

    const { AdminUser, RolePermission } = getModels();
    const body = request.body || {};
    const adminUser = await AdminUser.findByPk(request.params.id, {
      include: [
        { model: RolePermission, as: 'rolePermission' },
      ],
    });

    if (!adminUser) {
      return reply.status(404).send({ message: '管理员不存在。' });
    }

    if (body.roleCode) {
      const role = await RolePermission.findOne({ where: { roleCode: body.roleCode } });
      if (!role) {
        return reply.status(400).send({ message: '角色不存在。' });
      }
    }

    if (adminUser.id === request.currentAdmin?.id && body.status === 'disabled') {
      return reply.status(400).send({ message: '不能禁用当前登录账号。' });
    }

    const nextValues = {
      displayName: body.displayName || adminUser.displayName,
      status: body.status || adminUser.status,
      roleCode: body.roleCode || adminUser.roleCode,
    };

    if (body.password) {
      nextValues.passwordHash = await bcrypt.hash(body.password, 10);
    }

    await adminUser.update(nextValues);
    await adminUser.reload({
      include: [
        { model: RolePermission, as: 'rolePermission' },
      ],
    });

    await recordAuditLog({
      ...getAdminAuditMeta(request),
      eventType: 'admin_user_updated',
      resourceType: 'admin_user',
      resourceId: adminUser.id,
      status: 'success',
      message: `管理员 ${adminUser.email} 已更新。`,
      metadata: {
        email: adminUser.email,
        roleCode: adminUser.roleCode,
        status: adminUser.status,
      },
    });

    return serializeAdminUser(adminUser);
  });
}

module.exports = { accessControlRoutes };
