# Email Center 优化方案（存档）

> 状态说明：本文档为 2025 年维护阶段优化方案的评审存档。
> 用户已确认的关键决策：
> 1. 管理台需要「定时发送」UI（批次 1 包含前端改造）。
> 2. Resend 当前账号**不支持 webhook**（批次 2 需调整，见下）。
> 3. 部署平台为宝塔 Linux + Node.js 项目管理（PM2），**无 GitHub/GitLab CI**（批次 4 以本地质量门禁为主）。
> 4. 告警接收邮箱：`sunshineforluck@163.com`（批次 2 使用）。

执行基线仍以 `docs/EMAIL_CENTER_IMPLEMENTATION.md` 为准；本文件只记录维护阶段优化。

---

## 总体策略

按「先修 bug 和安全，再补闭环，最后工程化」分 5 批推进，每批独立可验收、可单独上线。

| 批次 | 内容 | 性质 | 状态 |
|---|---|---|---|
| 1 | 定时发送、登录防爆破、启动配置校验、收件人校验 | Bug 修复 + 安全快赢 | 已完成，自动化联调通过 |
| 2 | 送达回执 / 退信告警 | 核心闭环 | 已完成（Resend webhook 方案） |
| 3 | SMTP 连接池、失败任务手动重试、日志清理 | 可靠性 | 已完成，自动化联调通过 |
| 4 | 单元测试 + Lint（本地质量门禁） | 工程化 | 已完成 |
| 5 | 前端 XSS 加固 / token 存储、API Key 日额度 | 可选安全强化 | 未开始 |

---

## 批次 1：Bug 修复 + 安全快赢（已完成，待真机联调）

### 1.1 修复定时发送（scheduledAt 不生效）+ 管理台定时发送 UI

**现状**：`scheduledAt` 入库但不生效——手动审批（`routes/send-requests.js`）与内部 API 自动审批（`services/send-request-service.js`）两条路径入队时均未传 BullMQ `delay`；前端无定时入口。

**改动**：
- `services/send-request-service.js`：新增 `computeQueueDelay(scheduledAt)`（过去时间返回 0）；审批入队时传 `{ delay, jobId: emailJob.id }`，jobId 幂等防止重复入队。
- `routes/send-requests.js` 手动审批 approve 分支：同样补 `delay + jobId`。
- 创建申请统一校验 `scheduledAt`：必须为合法 ISO 时间且晚于当前（`assertValidScheduledAt`，在服务层统一处理，管理端与内部 API 都覆盖）。
- 前端 `views/SendApprovalsView.vue`：创建表单加「立即发送 / 定时发送」切换 + `el-date-picker`（datetime，禁用过去时间）；申请详情展示计划发送时间。

**验收**：内部 API 或管理台创建 N 分钟后的定时申请并审批 → N 分钟内未发信、到期后发送成功；重复审批不产生重复任务；过去时间 / 非法格式被 400 拒绝。

### 1.2 登录防爆破 + 敏感接口限流

**现状**：`/auth/login` 无限流无锁定；`/mail/test`、`/queue/test` 可反复触发。

**改动**：
- 新增 `services/login-guard.js`（Redis）：
  - 按 email 记 15 分钟滑动窗口内失败次数，≥ 5 次锁定该 email 30 分钟；
  - 按 IP 记每分钟尝试次数，> 10 次返回 429；
  - 登录成功清除该 email 失败计数。
- `routes/auth.js` login：先查锁 → 失败计数 → 命中锁定写审计 `admin_login_locked`。
- `app.js`：Fastify 开启 `trustProxy: true`，使 Nginx 反代后 `request.ip` 取真实客户端 IP。
- 对 `/mail/test`、`/queue/test` 加 Redis 固定窗口限流（每管理员每分钟）。
- 环境变量（`env.js` + `.env.example`）：`APP_LOGIN_MAX_FAILURES`（5）、`APP_LOGIN_LOCK_MINUTES`（30）、`APP_LOGIN_IP_MAX_PER_MINUTE`（10）。

**验收**：同一 email 连续错 5 次后第 6 次即使密码正确也 429；30 分钟后自动解锁；不同 IP 不受 email 锁影响；审计有锁定事件。

### 1.3 启动安全配置校验

**现状**：`APP_JWT_SECRET`、`RESEND_SMTP_PASS` 为空时照常启动。

**改动**：
- `config/env.js` 导出 `validateRequiredConfig()`；`APP_ENV=production` 时强制：JWT secret ≥ 32 字符、`RESEND_SMTP_PASS` 非空、`DB_HOST` 非空、`APP_WEB_URL/APP_BASE_URL` 为 https，任一缺失**拒绝启动**并列出缺失项；非生产仅告警。
- `server.js` 与 `workers/email-worker.js` 启动时调用。

**验收**：production 下删除任一必需变量 → 启动失败并明确报错；恢复后正常。

### 1.4 收件人邮箱格式校验

**现状**：全链路只按逗号拆分，无格式校验。

**改动**：
- 新增 `utils/email-utils.js`：`isValidEmailAddress`（正则 + 长度 ≤ 254 + 域名合法性）、`extractEmailAddresses`（支持 `"Name <email>"` 与逗号/分号分隔）、`validateRecipientList`（抛错时带出具体非法地址）。
- 接入点：`services/send-request-service.js`（to/cc/bcc 统一校验，覆盖管理端与内部 API 全入口）、`routes/mail.js` 的 `/mail/test`、`mail-service.js` 兜底。

**验收**：非法地址在各入口返回 400 且错误含该地址；显示名格式合法地址正常通过。

---

## 批次 2：送达回执 / 退信告警（已完成：Resend Webhook 方案）

**用户查证 Resend 支持 webhook**（dashboard 可 Add webhook，也可用 API 创建，事件含 `email.bounced` / `email.delivered` / `email.complained` / `email.opened` / `email.clicked`），因此采用 **Resend webhook** 实现送达闭环。Resend 使用 **Svix 标准签名**（`svix-id` / `svix-timestamp` / `svix-signature`，HMAC-SHA256，默认 5 分钟时间戳容差）。

### 实现（均已落地）
- **迁移 `006-mail-feedback-events.js`**：`email_jobs` 增加 `bounced_at` / `bounce_type` / `bounce_reason` / `delivered_at`；新建 `mail_feedback_events` 表（含索引）。
- **路由 `routes/webhooks.js`**：`POST /webhooks/resend`（公开白名单）。用 `preParsing` 钩子捕获原始请求体做签名校验；`webhook-signature.js` 实现 Svix 签名验证（未配 `RESEND_WEBHOOK_SECRET` 时开发环境放行）。
- **`services/mail-feedback-service.js`**：规范化事件 → 按 `message_id` 精确关联（兜底按收件人）→ 更新 `email_jobs`（bounced/delivered/complaint）+ `send_requests.deliveryStatus` → 写 `mail_feedback_events` / `email_logs` → 向 `MAIL_ALERT_TO` 发告警。
- **`routes/logs.js`**：邮件任务详情与列表包含 `feedbackEvents`；前端日志页展示回执事件与「已退信/已送达」状态标签。
- 环境变量（`.env.example`）：`RESEND_WEBHOOK_SECRET`、`MAIL_ALERT_TO=sunshineforluck@163.com`。

### E2E（P10）验证：无效签名 401；bounced → 任务置 bounced + 回执事件落库 + 告警邮件被捕获；delivered → 置 delivered；未知 messageId 事件不报错。

### 需要你在外部（Resend / 宝塔）完成
1. 在 Resend dashboard 或 API 创建 webhook，Endpoint URL 指向 `https://email.pixris.online/api/webhooks/resend`，事件选择 `email.bounced`、`email.complained`、`email.delivered`、`email.opened`、`email.clicked`。
2. 把 Resend 提供的签名 secret（`whsec_...`）填入生产 `.env` 的 `RESEND_WEBHOOK_SECRET`。
3. 确认宝塔 Nginx 已将 `/api/webhooks/...` 反代到后端（现 `/api` 反代应已覆盖，如 webhook 路径有前缀另加一条 location）。

---

## 批次 3：可靠性（已完成）

### 3.1 SMTP 连接池 ✅
`config/smtp.js` 提供进程级单例 `getSmtpTransport()`（`pool: true, maxConnections: 5, maxMessages: 100` + error 监听），`mail-service` 复用，worker 退出时 `closeSmtpTransport()`。
E2E 实测：10 封并发直发仅新建 **1 个** SMTP 连接（P7）。

### 3.2 失败任务手动重试 ✅
后端 `POST /queue/jobs/:emailJobId/retry`（管理员）：仅 failed 任务可重试，创建新 EmailJob 重新入队（jobId = 新行 id，天然幂等），原失败任务保留为历史，写审计 `email_job_retried`；同一申请有进行中任务时拒绝重复重试。
前端日志页（`LogsView.vue`）失败任务显示「重试」按钮。
E2E 实测：拒收→failed→重试→sent 全链路通过（P8）。

### 3.3 日志清理与保留策略 ✅
`scripts/purge-old-logs.js`：按 `LOG_RETENTION_DAYS`（默认 180）分批删除 `email_logs`/`audit_logs`/`send_approval_logs`/`template_review_logs`（created_at 切片 + count 对比驱动分批，避免长锁）；`--dry-run` 只统计。`pnpm logs:purge` 一键执行，建议宝塔计划任务每日运行。
E2E 实测：dry-run 统计与实际删除数一致，清理后日志表归零（P9）。

---

## 批次 4：工程化（已完成；受决策 3 影响，无远端 CI，以本地质量门禁为主）

- **单元测试**：后端 Node 内置 `node:test`（`pnpm test`，自动发现 `test/unit/*.test.js`），**30/30 通过**，覆盖：`template-renderer`、`api-key-service`、`email-utils`、`send-request-service`（辅助函数）、`webhook-signature`（Svix 5 例）、`mail-feedback-service`（事件规范化）。
- **ESLint**：backend（CommonJS+Node）与 frontend（ESM+Browser，`.js` 源文件）各一份扁平最小规则集（no-undef / no-unused-vars / no-constant-condition），`pnpm lint` 双端全绿（0 错误 0 警告）。
- **E2E 收编**：`tmp/e2e` 迁至 `scripts/e2e/`（含纯 Node 自签名证书生成器，首次运行自动生成），`pnpm test:e2e` 一键运行。前置：本地 Redis + PostgreSQL；用假 SMTP（127.0.0.1:465 TLS）隔离，不发真实邮件。**58/58 通过**。
- **日志清理**：`mail_feedback_events`（按 `received_at`）纳入 `pnpm logs:purge`。
- **一键门禁**：`pnpm verify` = lint + test + build:frontend，本地全绿。

> 说明：无远端 CI（宝塔部署），如需自动化可在宝塔加 webhook/计划任务执行 `pnpm verify` 与部署。

---

## 批次 5（可选，改动大）：安全强化

- 5.1 模板审核通过后锁定内容 / 版本化，消除 `v-html` 存储型 XSS 链。
- 5.2 JWT 从 localStorage 迁移到 HttpOnly + Secure cookie（需 CSRF 防护，单独立项）。
- 5.3 API Key（`send:direct`）增加 Redis 日发送上限。

---

## 待办 / 风险清单

- [x] 批次 1 本地自动化联调通过：`tmp/e2e/e2e.cjs`（本地假 SMTP TLS 服务器 + 独立 Redis 队列 + 真实 API/Worker 进程）。覆盖：定时发送 delayed→到点发送（不早于计划时间）、立即发送回归、内部 API direct 直发与幂等重放、登录 4 次 401 后 429 锁定 + 审计、非法收件人/过期与非法 scheduledAt 400、/mail/test 第 11 次 429。
- [x] 批次 2 本地自动化联调通过：webhook 无效签名 401；bounced → 任务置 bounced + `mail_feedback_events` 落库 + `email_logs` 记录 + 告警邮件被捕获；delivered → 置 delivered；未知 messageId 事件不报错。
- [x] 批次 3 本地自动化联调通过：SMTP 连接复用（10 封少连接）、失败→重试→成功全链路（原任务保留 + 审计）、日志清理 dry-run/实际删除/归零。
- [x] 批次 1+2+3 完整回归 58/58 通过（`node scripts/e2e/e2e.cjs`，已收编为 `pnpm test:e2e`）；后端单测 30/30。
- [x] 批次 4 完成：ESLint 双端全绿、`pnpm verify` 本地门禁通过。
- [ ] **生产环境（宝塔）部署与验收**——批次 1-4 代码部署、PM2 重启、Nginx `X-Forwarded-For` 确认、`/api/webhooks/resend` 反代与 `RESEND_WEBHOOK_SECRET` 配置、前端新 UI 人工目检、宝塔计划任务 `pnpm logs:purge`。
- [ ] **webhook 生效验证（在服务器上执行）**：`curl -i -X POST https://email.pixris.online/api/webhooks/resend -H 'Content-Type: application/json' -d '{"type":"email.bounced"}'` → 期望 401（签名不匹配即说明路由已生效）；若 404/405 则检查 Nginx 反代与部署版本。之后用真实收件地址发送并触发一次退信，确认任务状态变 `bounced` 且收到告警邮件。
- [ ] Resend 侧：webhook 已创建（Endpoint `https://email.pixris.online/api/webhooks/resend`，事件勾选见批次 2 章节），secret 已填入。
- [ ] 所有改动完成后回写 `docs/EMAIL_CENTER_IMPLEMENTATION.md` 状态。
