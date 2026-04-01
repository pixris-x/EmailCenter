const PERMISSION_GROUPS = [
  {
    key: 'dashboard',
    label: '仪表盘',
    permissions: [
      { code: 'dashboard:view', label: '查看仪表盘', description: '允许查看首页概览数据。' },
    ],
  },
  {
    key: 'templates',
    label: '模板中心',
    permissions: [
      { code: 'templates:manage', label: '管理模板', description: '允许维护模板与模板分类。' },
      { code: 'template_reviews:manage', label: '审核模板', description: '允许审核模板并查看审核队列。' },
    ],
  },
  {
    key: 'send',
    label: '发送中心',
    permissions: [
      { code: 'send_approvals:manage', label: '发送审批', description: '允许创建发送申请、审批与管理附件。' },
      { code: 'senders:manage', label: '管理发件人', description: '允许维护发件人身份。' },
    ],
  },
  {
    key: 'integration',
    label: '接口与日志',
    permissions: [
      { code: 'api_keys:manage', label: '管理接口密钥', description: '允许创建和吊销内部接口密钥。' },
      { code: 'logs:view', label: '查看日志', description: '允许查看发送日志、审核日志与审计日志。' },
      { code: 'smtp_test:use', label: 'SMTP 测试', description: '允许使用 SMTP 测试页与健康检查。' },
    ],
  },
  {
    key: 'system',
    label: '系统权限',
    permissions: [
      { code: 'auth_admins:manage', label: '账号与权限管理', description: '允许管理管理员账号、角色和权限。' },
    ],
  },
]

const PERMISSION_CATALOG = PERMISSION_GROUPS.flatMap((group) => group.permissions)
const PERMISSION_CODES = PERMISSION_CATALOG.map((item) => item.code)

function normalizePermissions(permissions) {
  if (!Array.isArray(permissions)) {
    return []
  }

  const normalized = permissions
    .map((item) => String(item || '').trim())
    .filter(Boolean)

  if (normalized.includes('*')) {
    return ['*']
  }

  return [...new Set(normalized.filter((item) => PERMISSION_CODES.includes(item)))]
}

function hasPermission(subject, permissionCode) {
  const permissions = subject?.permissions || []
  return permissions.includes('*') || permissions.includes(permissionCode)
}

function hasAnyPermission(subject, permissionCodes = []) {
  if (!permissionCodes.length) {
    return true
  }

  return permissionCodes.some((permissionCode) => hasPermission(subject, permissionCode))
}

function serializeRolePermission(role, extra = {}) {
  if (!role) {
    return null
  }

  const json = typeof role.toJSON === 'function' ? role.toJSON() : role
  return {
    id: json.id,
    roleCode: json.roleCode,
    roleName: json.roleName,
    permissions: normalizePermissions(json.permissions),
    description: json.description || '',
    createdAt: json.createdAt || json.created_at || null,
    updatedAt: json.updatedAt || json.updated_at || null,
    adminUserCount: extra.adminUserCount || 0,
  }
}

function serializeAdminUser(adminUser) {
  if (!adminUser) {
    return null
  }

  const json = typeof adminUser.toJSON === 'function' ? adminUser.toJSON() : adminUser
  const rolePermission = serializeRolePermission(json.rolePermission)

  return {
    id: json.id,
    email: json.email,
    displayName: json.displayName,
    status: json.status,
    roleCode: json.roleCode,
    roleName: rolePermission?.roleName || json.roleCode,
    permissions: rolePermission?.permissions || [],
    lastLoginAt: json.lastLoginAt || null,
    createdAt: json.createdAt || json.created_at || null,
    updatedAt: json.updatedAt || json.updated_at || null,
    rolePermission,
  }
}

function ensurePermission(request, reply, permissionCode) {
  if (hasPermission(request.currentAdmin, permissionCode)) {
    return true
  }

  reply.status(403).send({ message: '当前账号没有此操作权限。' })
  return false
}

module.exports = {
  PERMISSION_GROUPS,
  PERMISSION_CATALOG,
  PERMISSION_CODES,
  normalizePermissions,
  hasPermission,
  hasAnyPermission,
  serializeRolePermission,
  serializeAdminUser,
  ensurePermission,
}
