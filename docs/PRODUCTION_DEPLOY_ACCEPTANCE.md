# 生产部署与验收清单（批次 1–4）

> 面向宝塔 Linux（PM2 + Nginx）部署。本文档不包含任何真实密钥，需自行在服务器 `.env` 中填写。
> 配套文档：`docs/OPERATION_MANUAL.md`（基础部署）、`docs/EMAIL_CENTER_IMPLEMENTATION.md`（执行基线）、`docs/OPTIMIZATION_PLAN.md`（优化记录）。

---

## 一、环境变量清单（生产 `.env` 应包含全部键）

| 键 | 本地默认 | 生产建议 | 说明 |
|---|---|---|---|
| `APP_ENV` | development | **production** | 触发启动配置强校验（JWT/DB/SMTP/https） |
| `APP_PORT` | 3000 | 3000（或内网端口） | 后端监听端口 |
| `APP_BASE_URL` / `APP_WEB_URL` | http://localhost:3000 / :5173 | **https://email.pixris.online** | 生产必须 https，否则拒绝启动 |
| `APP_JWT_SECRET` | 任意 | **≥32 字符随机串**（必填） | 漏配生产会拒绝启动 |
| `APP_ENCRYPTION_KEY` | 空 | 可选（当前未使用，预留） | |
| `APP_ATTACHMENT_DIR` | ./storage/attachments | ./storage/attachments | 相对路径，兼容 Linux |
| `DB_*` | 本地 | 腾讯云/宝塔 PostgreSQL | host/port/name/user/password/ssl |
| `REDIS_*` | 本地 | 服务器 Redis | host/port/password |
| `RESEND_SMTP_*` | 本地 | Resend 465 凭据 | `RESEND_SMTP_PASS` 必填 |
| `MAIL_DEFAULT_FROM_*` | Pixris | @email.pixris.online | 默认发件人 |
| `MAIL_ATTACHMENT_MAX_MB` | 10 | 10 | 附件上限 |
| `QUEUE_EMAIL_NAME` | email-send | email-send | 队列名 |
| `QUEUE_EMAIL_CONCURRENCY` | 1 | 1–5 | worker 并发（建议从 2 起步观察） |
| `QUEUE_EMAIL_MAX_RETRIES` | 3 | 3 | 失败重试次数 |
| `INTERNAL_API_RATE_LIMIT_PER_MINUTE` | 30 | 30 | 内部 API 每 Key 限流 |
| `APP_LOGIN_MAX_FAILURES` | 5 | 5 | 登录失败锁定阈值（15 分钟窗口） |
| `APP_LOGIN_LOCK_MINUTES` | 30 | 30 | 邮箱锁定分钟数 |
| `APP_LOGIN_IP_MAX_PER_MINUTE` | 10 | 10 | 单 IP 每分钟登录上限 |
| `LOG_RETENTION_DAYS` | 180 | 180 | `logs:purge` 保留天数 |
| `MAIL_ALERT_TO` | sunshineforluck@163.com | sunshineforluck@163.com | 退信/投诉告警收件人 |
| `RESEND_WEBHOOK_SECRET` | 空（开发放行） | **whsec_...（必填）** | Resend webhook 签名密钥 |
| `RESEND_WEBHOOK_TOLERANCE_SECONDS` | 300 | 300 | 签名时间戳容差 |
| `ADMIN_BOOTSTRAP_*` | — | 初始化用 | 建管理员后建议从 .env 移除 |
| `VITE_API_BASE_URL` | /api | /api | 前端构建时使用（见前端部署） |
| `VITE_API_ENABLE_LOG` / `VITE_API_RETRY_*` | 按需 | 生产建议 log=false | 前端请求层开关 |

> ⚠️ `.env` 已被 `.gitignore` 忽略；请勿把含真实密钥的 `.env` 提交或外发。文中所有 `whsec_...`、`<密码>` 均为占位。

---

## 二、后端部署步骤（宝塔）

```bash
# 1. 进入项目目录（示例）
cd /www/wwwroot/EmailCenter

# 2. 拉取代码 + 安装依赖
git pull
pnpm install --frozen-lockfile   # 或 pnpm install

# 3. 编辑 .env，补齐【一】清单中所有键（APP_ENV=production）
#    然后把 RESEND_WEBHOOK_SECRET 填为 Resend 提供的 whsec_...

# 4. 执行数据库迁移（幂等，可重复跑）
pnpm db:migrate

# 5. 重启后端 API（PM2）
# 推荐：仓库根已有 ecosystem.config.js（编排 API + email worker 两个进程，密钥外置走 .env）
#   若路径不是 /www/wwwroot/EmailCenter，先修改 ecosystem.config.js 顶部的 APP_ROOT
pm2 start ecosystem.config.js     # 首次启动
pm2 restart ecosystem.config.js   # 或更新代码后：pm2 restart email_center_api && pm2 restart email_center_worker
pm2 save                          # 保存进程列表（服务器重启自动恢复）
# pm2 startup                      # 按提示执行输出的一次性命令以开启开机自启（只需一次）

# 等价的手动方式：
# cd /www/wwwroot/EmailCenter && pm2 start backend/src/server.js --name email_center_api
# cd /www/wwwroot/EmailCenter && pm2 start backend/src/workers/email-worker.js --name email_center_worker

# 6. 确认进程健康
pm2 status
pm2 logs email_center_api --lines 50   # 确认无「生产配置校验失败/警告」
curl -s http://127.0.0.1:3000/health | head -c 300   # 端口以 .env 的 APP_PORT 为准
```

> 若 `APP_ENV=production` 后启动失败，说明配置校验拦截——查看 `pm2 logs` 中列出的缺失项并补齐。

---

## 三、前端部署

```bash
cd /www/wwwroot/EmailCenter
# 构建时需 VITE_API_BASE_URL=/api（默认即可）
pnpm build:frontend
# 将 frontend/dist 内容发布到站点目录（宝塔站点根），或按现有部署方式同步
```

Nginx 要点（宝塔站点配置内）：
1. `/` → 站点根 `frontend/dist`（静态）；
2. `/api/` 反向代理到 `http://127.0.0.1:3000`（含 `/api/webhooks/resend`）；
3. 已配置 HTTPS；
4. 反代需传递 `X-Forwarded-For`（登录防爆破取真实 IP；宝塔默认会带）。

---

## 四、计划任务

宝塔计划任务（Shell，每日一次）：
```bash
cd /www/wwwroot/EmailCenter && /www/server/nodejs/.../pnpm logs:purge 2>&1 >> logs/purge.log
```
（路径以服务器 pnpm/node 实际位置为准；先手动 `pnpm logs:purge --dry-run` 验证。）

---

## 五、验收清单

### A. 服务与安全基线
- [ ] `pm2 status`：API 与 email worker 均 online，无反复重启
- [ ] `curl http://127.0.0.1:3000/health` 返回 ok
- [ ] 启动日志无「配置校验警告/失败」（生产缺 JWT/DB/SMTP/Webhook secret 会拦启动）
- [ ] 管理台经 https 打开，登录成功；连续错 5 次密码后返回 429，30 分钟后自动解锁；审计日志出现 `admin_login_locked`
- [ ] 从非本机 IP 登录失败时锁定按真实客户端 IP 生效（验证 XFF 已传）

### B. Webhook 送达闭环（批次 2 重点）
- [ ] **路由生效**：服务器上执行
      `curl -i -X POST https://email.pixris.online/api/webhooks/resend -H 'Content-Type: application/json' -d '{"type":"email.bounced"}'`
      → 期望 **HTTP 401**（无签名被拒）；404/405 说明反代或部署版本不对
- [ ] Resend 侧：webhook Endpoint `https://email.pixris.online/api/webhooks/resend`，事件含 bounced/complained/delivered（可按需加 opened/clicked）
- [ ] **退信实测**：向一个不存在的收件地址发一封真实邮件 → 日志页该任务状态变「已退信」，详情含回执事件（原因/状态码）→ `sunshineforluck@163.com` 收到【邮件退信告警】
- [ ] 送达邮件（可选）：正常地址发送后收到 `email.delivered` 事件 → 状态「已送达」

### C. 发信链路回归（批次 1/3）
- [ ] 立即发送：创建模板→审核通过→创建发送申请→审批 → 任务 sent，邮件收到
- [ ] 定时发送：创建申请设「定时发送」= 2 分钟后 → 审批后到点才发出（早于计划时间不应发出）
- [ ] 失败重试：日志页对 failed 任务点「重试」→ 新任务入队并发送成功；原失败任务保留
- [ ] 内部 API：`simple-send`（带 `send:direct` Key）返回 202 deliveryMode=direct；同幂等键重放返回 `duplicated:true`
- [ ] 非法收件人/过去定时时间创建返回 400 且提示含该地址

### D. 运维与数据
- [ ] `pnpm logs:purge --dry-run` 输出各表可删行数；宝塔计划任务已配置且手动执行一次成功
- [ ] 附件上传/下载正常（相对路径目录 `storage/attachments` 存在且有写权限）
- [ ] 日志页/审批页分页与详情抽屉正常；回执事件、重试按钮、已退信/已送达标签展示正确

---

## 六、回滚与排障速查

| 现象 | 排查 |
|---|---|
| 后端反复重启 | `pm2 logs` 看启动错误；生产配置校验失败 → 按提示补 .env |
| 发信失败 | worker 日志 `worker.log`；`email_jobs.lastError`；Redis 是否在线（`pnpm redis:ping`） |
| webhook 未触发/401 风暴 | 确认 `RESEND_WEBHOOK_SECRET` 与 Resend 面板 secret 一致；Nginx `/api` 反代；时间同步（容差 300s） |
| 登录无法锁定 | 确认 Nginx 传 `X-Forwarded-For` 且后端 `trustProxy` 开启 |
| 需要回滚 | `git log` 找到上个稳定提交 → `git checkout <sha> -- backend frontend` → `pnpm install` → `pnpm db:migrate` → 重启 PM2 |
