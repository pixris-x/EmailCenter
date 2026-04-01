const bcrypt = require('bcryptjs');
const { sequelize, isDatabaseConfigured } = require('../src/config/database');
const { initModels } = require('../src/models');

function getBootstrapAdminConfig() {
  const [, , argEmail, argDisplayName, argPassword] = process.argv;

  return {
    email: argEmail || process.env.ADMIN_BOOTSTRAP_EMAIL || '',
    displayName: argDisplayName || process.env.ADMIN_BOOTSTRAP_NAME || '',
    password: argPassword || process.env.ADMIN_BOOTSTRAP_PASSWORD || '',
  };
}

function printUsage() {
  console.log('用法 1：pnpm admin:create 管理员邮箱 显示名称 管理员密码');
  console.log('示例：pnpm admin:create admin@email.pixris.online 系统管理员 MyStrongPassword123');
  console.log('用法 2：在 .env 中配置 ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_NAME / ADMIN_BOOTSTRAP_PASSWORD 后，直接执行 pnpm admin:create');
}

async function ensureSuperAdminRole(RolePermission) {
  const [role] = await RolePermission.findOrCreate({
    where: { roleCode: 'super_admin' },
    defaults: {
      roleCode: 'super_admin',
      roleName: '超级管理员',
      permissions: ['*'],
      description: '邮件中心超级管理员角色',
    },
  });

  await role.update({
    roleName: '超级管理员',
    permissions: ['*'],
    description: '邮件中心超级管理员角色',
  });
}

async function main() {
  const { email, displayName, password } = getBootstrapAdminConfig();

  if (!email || !displayName || !password) {
    printUsage();
    process.exit(1);
  }

  if (!isDatabaseConfigured()) {
    console.error('数据库环境变量未配置完整，无法创建管理员。');
    process.exit(1);
  }

  const models = initModels(sequelize);
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await sequelize.authenticate();
    await ensureSuperAdminRole(models.RolePermission);

    // 管理员邮箱已存在时，脚本会自动更新密码和显示名称，方便初始化和重置。
    const [adminUser, created] = await models.AdminUser.findOrCreate({
      where: { email },
      defaults: {
        email,
        passwordHash,
        displayName,
        status: 'active',
        roleCode: 'super_admin',
      },
    });

    if (!created) {
      await adminUser.update({
        passwordHash,
        displayName,
        status: 'active',
        roleCode: 'super_admin',
      });
    }

    console.log(created ? '管理员账号创建成功。' : '管理员账号已存在，信息已更新。');
    console.log(`邮箱：${email}`);
    console.log(`显示名称：${displayName}`);
    console.log('角色：super_admin');
  } catch (error) {
    console.error(`创建管理员失败：${error.message}`);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
}

main();
