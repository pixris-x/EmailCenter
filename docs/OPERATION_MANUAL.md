# Email Center 操作文档

## 1. 文档说明

本文档用于指导你在 Linux 服务器上部署、维护和使用 Pixris 邮件中心。

适用环境：
- Linux 服务器
- 宝塔面板
- Node.js
- PostgreSQL
- Redis
- Resend SMTP

本文档不记录任何真实密钥、数据库密码或服务器登录凭据。

## 2. 目录结构

项目根目录建议如下：

```text
/www/wwwroot/email-center/
├─ backend/
├─ frontend/
├─ docs/
├─ storage/
│  └─ attachments/
├─ .env
├─ package.json
├─ pnpm-lock.yaml
└─ pnpm-workspace.yaml
```

附件目录使用相对路径：

```env
APP_ATTACHMENT_DIR=./storage/attachments
```

这意味着无论在 Windows 本地还是 Linux 服务器，附件都会存放在项目根目录下的 `storage/attachments/` 中。

## 3. 服务器准备

建议在宝塔中准备以下环境：
- Node.js 18 或更高版本
- pnpm 10
- Nginx
- PM2
- PostgreSQL 客户端工具
- Redis

如果服务器未安装 pnpm，可执行：

```bash
npm install -g pnpm
```

## 4. 上传与安装

将项目上传到 Linux 服务器，例如：

```bash
cd /www/wwwroot
mkdir -p email-center
```

上传完成后安装依赖：

```bash
cd /www/wwwroot/email-center
pnpm install
```

## 5. 环境变量配置

在项目根目录创建 `.env` 文件，参考 `.env.example` 填写。

重点配置项：

```env
APP_ENV=production
APP_HOST=0.0.0.0
APP_PORT=3000
APP_BASE_URL=https://email.pixris.online
APP_WEB_URL=https://email.pixris.online
APP_ATTACHMENT_DIR=./storage/attachments

DB_HOST=
DB_PORT=5432
DB_NAME=
DB_USER=
DB_PASSWORD=

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

RESEND_SMTP_HOST=smtp.resend.com
RESEND_SMTP_PORT=465
RESEND_SMTP_USER=resend
RESEND_SMTP_PASS=
MAIL_DEFAULT_FROM_NAME=Pixris
MAIL_DEFAULT_FROM_EMAIL=noreply@email.pixris.online

ADMIN_BOOTSTRAP_EMAIL=
ADMIN_BOOTSTRAP_NAME=
ADMIN_BOOTSTRAP_PASSWORD=
```

注意：
- `RESEND_SMTP_PORT` 必须为 `465`
- `APP_ATTACHMENT_DIR` 必须保持相对路径
- 不要把 `.env` 提交到代码仓库

## 6. 初始化数据库

执行数据库迁移：

```bash
cd /www/wwwroot/email-center
pnpm db:migrate
```

## 7. 创建管理员账号

### 7.1 推荐方式：通过 .env 一键创建

先在 `.env` 中填写：

```env
ADMIN_BOOTSTRAP_EMAIL=admin@email.pixris.online
ADMIN_BOOTSTRAP_NAME=系统管理员
ADMIN_BOOTSTRAP_PASSWORD=MyStrongPassword123
```

然后在项目根目录直接执行：

```bash
cd /www/wwwroot/email-center
pnpm admin:create
```

### 7.2 命令行直接传参

如果你不想把管理员信息放在 `.env`，也可以直接传参：

```bash
pnpm admin:create 管理员邮箱 显示名称 管理员密码
```

示例：

```bash
pnpm admin:create admin@email.pixris.online 系统管理员 MyStrongPassword123
```

脚本会自动完成：
- 创建或更新 `super_admin` 角色
- 创建管理员账号
- 自动生成并写入 bcrypt 密码哈希
- 如果邮箱已存在，则自动更新密码和显示名称

### 7.3 备用方式：手动生成哈希

```bash
cd /www/wwwroot/email-center
pnpm admin:hash 你的管理员密码
```

如果你确实需要手动执行 SQL，也可以把生成的哈希填入 `docs/sql/create_admin_user.sql` 后再执行。

## 8. 启动服务

### 8.1 启动后端 API

```bash
cd /www/wwwroot/email-center
pm2 start backend/src/server.js --name email-center-api
```

### 8.2 启动邮件 Worker

```bash
cd /www/wwwroot/email-center
pm2 start backend/src/workers/email-worker.js --name email-center-worker
```

### 8.3 构建前端

```bash
cd /www/wwwroot/email-center
pnpm build:frontend
```

构建产物默认在：

```text
frontend/dist/
```

## 9. 宝塔站点配置

### 9.1 前端站点

在宝塔创建站点：
- 域名：`email.pixris.online`
- 站点目录：`/www/wwwroot/email-center/frontend/dist`

### 9.2 反向代理 API

在宝塔站点中配置反向代理，将 `/api` 或整个后端请求代理到：

```text
http://127.0.0.1:3000
```

如果你希望前后端同域部署，前端的 `VITE_API_BASE_URL` 建议配置为：

```env
VITE_API_BASE_URL=/api
```

## 10. HTTPS 配置

在宝塔中为 `email.pixris.online` 申请并启用 SSL 证书。

启用后检查：
- 前端能正常打开
- 登录接口不报跨域
- SMTP 测试页可正常访问

## 11. 内部 API 使用说明

内部 API 使用 `x-api-key` 鉴权。

### 11.1 标准模板发送接口

接口：

```http
POST /internal-api/send-requests
```

### 11.2 简化发送接口

接口：

```http
POST /internal-api/simple-send
```

调用时最少只需要传：
- `senderEmail` 或 `sender`
- `subject` 或 `title`
- `toRecipients` 或 `recipient`
- `content`

示例：

```bash
curl -X POST 'https://email.pixris.online/internal-api/simple-send' \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: 你的接口密钥' \
  -d '{
    "sender": "noreply@email.pixris.online",
    "title": "系统通知",
    "recipient": "user@example.com",
    "content": "<p>你好，这是一封测试通知。</p>"
  }'
```

说明：
- 该接口仍会生成“待审批”的发送申请
- 如果 API Key 只绑定了一个项目，可以不传 `sourceProject`
- 如果传了 `Idempotency-Key`，重复请求会命中幂等返回

## 12. 日常运维命令

查看 PM2 状态：

```bash
pm2 status
```

查看后端日志：

```bash
pm2 logs email-center-api
```

查看 Worker 日志：

```bash
pm2 logs email-center-worker
```

重启后端：

```bash
pm2 restart email-center-api
```

重启 Worker：

```bash
pm2 restart email-center-worker
```

保存 PM2 进程：

```bash
pm2 save
```

设置开机启动：

```bash
pm2 startup
```

## 13. 上线检查清单

上线前确认：
- `.env` 已填写完整
- PostgreSQL 可连接
- Redis 可连接
- Resend 域名验证状态正常
- 默认发件邮箱已在系统中创建
- 已创建管理员账号
- 前端为中文界面
- `/mail/health` 检查通过
- 可发出真实测试邮件
- `storage/attachments/` 具备写入权限

## 14. 常见问题

### 14.1 登录失败

检查项：
- 管理员邮箱是否正确
- 管理员脚本是否执行成功
- `APP_JWT_SECRET` 是否已配置
- `.env` 中的管理员初始化信息是否填写正确

### 14.2 附件下载失败

检查项：
- `APP_ATTACHMENT_DIR` 是否仍为相对路径
- `storage/attachments/` 是否存在
- Linux 用户是否有读写权限

### 14.3 邮件未发出

检查项：
- 发送申请是否已经审批通过
- Worker 进程是否运行
- Resend SMTP 凭据是否有效
- SMTP 端口是否仍为 `465`


开发环境说明：
- 本地运行 pnpm dev:frontend 时，前端默认通过 Vite 代理把 /api 请求转发到 VITE_API_PROXY_TARGET`r
- 这样浏览器不会直接跨域访问后端，从而避免本地 CORS 报错

