-- 创建管理员账号 SQL 脚本
-- 使用步骤：
-- 1. 先执行：pnpm --dir backend admin:hash 你的管理员密码
-- 2. 将下面的邮箱、显示名、密码哈希替换为真实值
-- 3. 在 PostgreSQL 中执行本脚本

INSERT INTO role_permissions (
  id,
  role_code,
  role_name,
  permissions,
  description,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000101',
  'super_admin',
  '超级管理员',
  '["*"]'::jsonb,
  '邮件中心超级管理员角色',
  NOW(),
  NOW()
)
ON CONFLICT (role_code) DO UPDATE
SET
  role_name = EXCLUDED.role_name,
  permissions = EXCLUDED.permissions,
  description = EXCLUDED.description,
  updated_at = NOW();

INSERT INTO admin_users (
  id,
  email,
  password_hash,
  display_name,
  status,
  role_code,
  last_login_at,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000201',
  'admin@email.pixris.online',
  '$2b$10$f.3a2d7MwOeIrfhiwXBxAedptNVeXW5e645Jf.wrgoEPfJe7xO9y.',
  '系统管理员',
  'active',
  'super_admin',
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE
SET
  password_hash = EXCLUDED.password_hash,
  display_name = EXCLUDED.display_name,
  status = EXCLUDED.status,
  role_code = EXCLUDED.role_code,
  updated_at = NOW();
