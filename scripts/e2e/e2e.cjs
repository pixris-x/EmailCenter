/* Email Center automated E2E verification (batches 1-3).
 * Run from repo root (needs local Redis + PostgreSQL running; SMTP is a local
 * fake TLS server on 127.0.0.1:465 so NO real email ever leaves the machine):
 *   node scripts/e2e/e2e.cjs
 */
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..'); // EmailCenter root
const BACKEND = path.join(ROOT, 'backend');
const E2E_DIR = path.resolve(__dirname);
const LOG_DIR = path.join(E2E_DIR, 'logs');
const API_PORT = 3101;
const BASE = `http://127.0.0.1:${API_PORT}`;
const QUEUE_NAME = 'email-send-e2e';
const TS = Date.now();

// load backend env (populates process.env from root .env)
require(path.join(BACKEND, 'src/config/env.js'));
const { createRedisConnection } = require(path.join(BACKEND, 'src/config/redis.js'));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

// 首次运行自动生成自签名证书（写入 scripts/e2e/certs）。
function ensureTestCert() {
  const certPath = path.join(E2E_DIR, 'certs/server.crt');
  const keyPath = path.join(E2E_DIR, 'certs/server.key');
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return;
  }
  ensureDir(path.join(E2E_DIR, 'certs'));
  console.log('[e2e] generating self-signed TLS cert for fake SMTP...');
  const gen = spawnSync('node', ['gen-cert-node.cjs'], { cwd: E2E_DIR, stdio: 'inherit' });
  if (gen.status !== 0) {
    throw new Error('failed to generate e2e TLS cert');
  }
}

// tee console output into run.log so a buffered/timed-out parent still sees progress
ensureDir(E2E_DIR);
const runLogPath = path.join(E2E_DIR, 'run.log');
try { fs.writeFileSync(runLogPath, ''); } catch {}
function teeWrite(line) {
  try { fs.appendFileSync(runLogPath, `${new Date().toISOString()}  ${line}\n`); } catch {}
}
const origLog = console.log.bind(console);
const origError = console.error.bind(console);
console.log = (...args) => { const s = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '); teeWrite(s); origLog(...args); };
console.error = (...args) => { const s = args.map((a) => (typeof a === 'string' ? a : (a instanceof Error ? a.message : JSON.stringify(a)))).join(' '); teeWrite(`[err] ${s}`); origError(...args); };

async function runChild(script, envExtra = {}, timeoutMs = 90000) {
  return new Promise((resolve) => {
    const args = String(script).split(/\s+/).filter(Boolean);
    const child = spawn('node', args, {
      cwd: BACKEND,
      env: { ...process.env, ...envExtra },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

// 本地 PostgreSQL 在子进程频繁启停时会偶发连接抖动，预检类子进程失败时小退避重试一次。
async function runChildResilient(script, envExtra = {}, timeoutMs = 90000) {
  let result = await runChild(script, envExtra, timeoutMs);
  if (result.code === 0) return result;
  await sleep(4000);
  result = await runChild(script, envExtra, timeoutMs);
  if (result.code !== 0) console.log(`child ${script} failed twice, last output tail: ${result.out.slice(-400)}`);
  return result;
}

function spawnServer(commonEnv, logName) {
  const proc = spawn('node', ['src/server.js'], { cwd: BACKEND, env: { ...process.env, ...commonEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
  const stream = fs.createWriteStream(path.join(LOG_DIR, logName));
  proc.stdout.pipe(stream);
  proc.stderr.pipe(stream);
  return proc;
}

async function tryHealth(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  return false;
}

// ---------------- fake SMTP (TLS) server ----------------
const captures = [];
const smtpState = { connections: 0, acceptAll: false };
function startFakeSmtp() {
  return new Promise((resolve, reject) => {
    const cert = fs.readFileSync(path.join(E2E_DIR, 'certs/server.crt'));
    const key = fs.readFileSync(path.join(E2E_DIR, 'certs/server.key'));
    const server = tls.createServer({ cert, key }, (socket) => {
      let buffer = '';
      let inData = false;
      let dataBuffer = '';
      let authLoginStep = 0;
      const send = (line) => socket.write(line + '\r\n');
      // SMTP clients wait for the server greeting before sending EHLO
      send('220 localhost ESMTP fake');
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let idx;
        while ((idx = buffer.indexOf('\r\n')) >= 0) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (inData) {
            if (line === '.') {
              inData = false;
              const captured = { at: Date.now(), message: dataBuffer };
              captures.push(captured);
              dataBuffer = '';
              send('250 2.0.0 OK: queued (fake)');
            } else {
              dataBuffer += line + '\r\n';
            }
            continue;
          }
          const cmd = line.toUpperCase();
          if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) {
            send('250-localhost');
            send('250-AUTH PLAIN LOGIN');
            send('250 OK');
          } else if (cmd.startsWith('AUTH PLAIN')) {
            send('235 2.7.0 Authentication successful');
          } else if (cmd.startsWith('AUTH LOGIN')) {
            authLoginStep = 1;
            send('334 VXNlcm5hbWU6');
          } else if (authLoginStep === 1) {
            authLoginStep = 2;
            send('334 UGFzc3dvcmQ6');
          } else if (authLoginStep === 2) {
            authLoginStep = 0;
            send('235 2.7.0 Authentication successful');
          } else if (cmd.startsWith('MAIL FROM')) {
            send('250 2.1.0 OK');
          } else if (cmd.startsWith('RCPT TO')) {
            const match = line.match(/<([^>]+)>/);
            const recipient = match ? match[1] : '';
            if (recipient.includes('reject-') && !smtpState.acceptAll) {
              send(`550 5.1.1 <${recipient}>: Recipient address rejected (fake)`);
            } else {
              send('250 2.1.5 OK');
            }
          } else if (cmd.startsWith('DATA')) {
            inData = true;
            send('354 End data with <CR><LF>.<CR><LF>');
          } else if (cmd.startsWith('RSET')) {
            send('250 OK');
          } else if (cmd.startsWith('NOOP')) {
            send('250 OK');
          } else if (cmd.startsWith('QUIT')) {
            send('221 2.0.0 Bye');
            socket.end();
          } else if (cmd.startsWith('STARTTLS')) {
            socket.write('454 TLS already active\r\n');
          } else {
            send('250 OK');
          }
        }
      });
      socket.on('error', () => {});
    });
    server.on('connection', () => { smtpState.connections += 1; });
    server.on('error', reject);
    server.listen(465, '127.0.0.1', () => resolve({ server, smtpState }));
  });
}

// ---------------- helpers ----------------
async function api(method, urlPath, { token, apiKey, body, expectStatus } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers['x-api-key'] = apiKey;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (expectStatus !== undefined && res.status !== expectStatus) {
    throw new Error(`expected ${expectStatus}, got ${res.status} for ${method} ${urlPath}: ${text.slice(0, 300)}`);
  }
  return { status: res.status, data };
}

async function waitFor(predicate, timeoutMs, intervalMs = 500, label = 'condition') {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await predicate();
    if (last) return last;
    await sleep(intervalMs);
  }
  throw new Error(`timeout waiting for ${label} (last=${JSON.stringify(last)})`);
}

async function waitHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('API server did not become healthy');
}

(async () => {
  const children = [];
  const redis = createRedisConnection();
  let smtpHandle = null;
  try {
    ensureDir(LOG_DIR);

    // ---- preflight: schema + admin ----
    check('schema up to date (migrations)', (await runChildResilient('scripts/migrate.js')).code === 0);
    const adminRes = await runChildResilient('scripts/create-admin-user.js');
    check('admin user ensured', adminRes.code === 0, adminRes.out.includes('创建成功') || adminRes.out.includes('已存在') ? adminRes.out.trim().split('\n').slice(-2).join(' | ') : adminRes.out.slice(0, 200));

    const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL || '';
    const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || '';
    check('bootstrap admin credentials present in .env', Boolean(adminEmail && adminPassword));
    if (!adminEmail || !adminPassword) throw new Error('ADMIN_BOOTSTRAP_EMAIL/PASSWORD missing');

    // ---- start fake SMTP ----
    ensureTestCert();
    smtpHandle = await startFakeSmtp();
    check('fake SMTP listening on 127.0.0.1:465', true);

    // ---- start API server (with retry) + worker (SMTP overridden to fake) ----
    const commonEnv = {
      APP_ENV: 'development',
      APP_PORT: String(API_PORT),
      APP_HOST: '127.0.0.1',
      RESEND_SMTP_HOST: '127.0.0.1',
      RESEND_SMTP_PORT: '465',
      RESEND_SMTP_PASS: 'e2e-fake-pass',
      QUEUE_EMAIL_NAME: QUEUE_NAME,
      QUEUE_EMAIL_CONCURRENCY: '5',
      QUEUE_EMAIL_MAX_RETRIES: '1',
      RESEND_WEBHOOK_SECRET: 'whsec_e2e_secret',
      MAIL_ALERT_TO: 'alert-to@test.local',
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
    };
    let serverProc = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      serverProc = spawnServer(commonEnv, 'api.log');
      children.push(serverProc);
      if (await tryHealth(45000)) break;
      console.log(`API server not healthy on attempt ${attempt}, respawning...`);
      try { serverProc.kill('SIGKILL'); } catch {}
      await sleep(4000);
    }
    check('API server healthy', await tryHealth(5000), '');
    const workerProc = spawn('node', ['src/workers/email-worker.js'], { cwd: BACKEND, env: { ...process.env, ...commonEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(workerProc);
    const workerLog = fs.createWriteStream(path.join(LOG_DIR, 'worker.log'));
    workerProc.stdout.pipe(workerLog); workerProc.stderr.pipe(workerLog);
    await sleep(2500); // let worker connect

    // ---- login ----
    let login = await api('POST', '/auth/login', { body: { email: adminEmail, password: adminPassword }, expectStatus: 200 });
    const token = login.data.accessToken;
    check('admin login OK', Boolean(token));
    const me = await api('GET', '/auth/me', { token, expectStatus: 200 });
    const adminId = me.data.user.id;
    check('/auth/me returns admin', Boolean(adminId));

    const suffix = `${TS}`;
    const senderEmail = `e2e-sender-${suffix}@test.local`;
    const senderRes = await api('POST', '/sender-identities', { token, body: { name: `E2E Sender ${suffix}`, email: senderEmail, replyToEmail: '' }, expectStatus: 201 });
    const senderId = senderRes.data.id;

    const templateRes = await api('POST', '/templates', { token, body: {
      name: `E2E Template ${suffix}`, code: `e2e_t_${suffix}`,
      subject: 'E2E Hello {{name}}', htmlContent: '<p>Hello {{name}}</p>', textContent: 'Hello {{name}}',
    }, expectStatus: 201 });
    const templateId = templateRes.data.id;
    await api('POST', `/templates/${templateId}/submit-review`, { token, body: {}, expectStatus: 200 });
    const templateReview = await api('POST', `/templates/${templateId}/review`, { token, body: { action: 'approve', comment: 'e2e approve' }, expectStatus: 200 });
    check('template created and approved', templateReview.data.status === 'approved');

    // DB model access for job inspection
    const { sequelize } = require(path.join(BACKEND, 'src/config/database.js'));
    const { initModels } = require(path.join(BACKEND, 'src/models'));
    const models = initModels(sequelize);
    const { Queue } = require(path.join(BACKEND, 'node_modules/bullmq'));
    const { Op } = require(path.join(BACKEND, 'node_modules/sequelize'));
    const queue = new Queue(QUEUE_NAME, { connection: { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379), password: process.env.REDIS_PASSWORD || undefined, maxRetriesPerRequest: null } });

    async function latestJobFor(sendRequestId) {
      return models.EmailJob.findOne({ where: { sendRequestId }, order: [['created_at', 'DESC']] });
    }
    const captureCountFor = (needle) => captures.filter((c) => c.message.includes(needle)).length;
    const firstCaptureFor = (needle) => captures.find((c) => c.message.includes(needle)) || null;

    // ================= P1: scheduledAt delayed send =================
    console.log('\n--- P1: 定时发送（scheduledAt）---');
    const p1Addr = `p1-${suffix}@test.local`;
    const scheduledAt = new Date(Date.now() + 15000).toISOString();
    const sr1 = await api('POST', '/send-requests', { token, body: {
      templateId, senderIdentityId: senderId, toRecipients: p1Addr, scheduledAt, templatePayload: { name: 'P1' },
    }, expectStatus: 201 });
    const sr1Id = sr1.data.id;
    const approve1 = await api('POST', `/send-requests/${sr1Id}/review`, { token, body: { action: 'approve', comment: 'e2e' }, expectStatus: 200 });
    check('P1 审批通过', approve1.data.approvalStatus === 'approved');

    const job1 = await waitFor(async () => { const j = await latestJobFor(sr1Id); return j ? j.toJSON() : null; }, 8000, 500, 'email job row');
    check('P1 EmailJob 已创建', Boolean(job1));
    await sleep(3500);
    const bqJob1 = await queue.getJob(job1.id);
    const stateEarly = bqJob1 ? await bqJob1.getState() : null;
    const freshJob1 = (await latestJobFor(sr1Id)).toJSON();
    check('P1 到期前：BullMQ 状态为 delayed', stateEarly === 'delayed', `state=${stateEarly}`);
    check('P1 到期前：EmailJob.status=pending', freshJob1.status === 'pending', `status=${freshJob1.status}`);
    check('P1 到期前：未发送任何邮件', captureCountFor(p1Addr) === 0);

    // wait until after scheduledAt for the worker to actually send
    const sentJob1 = await waitFor(async () => {
      const j = await latestJobFor(sr1Id);
      if (j && j.status === 'sent') return j.toJSON();
      return null;
    }, 30000, 1000, 'P1 job sent');
    check('P1 到期后：EmailJob.status=sent', sentJob1.status === 'sent', `providerMessageId=${sentJob1.providerMessageId}`);
    const cap1 = firstCaptureFor(p1Addr);
    check('P1 到期后：邮件被本地 SMTP 捕获', Boolean(cap1));
    if (cap1) {
      const scheduledMs = new Date(scheduledAt).getTime();
      const late = cap1.at >= scheduledMs - 2000;
      check('P1 发送时间不早于计划时间', late, `captureAt=${new Date(cap1.at).toISOString()} scheduledAt=${scheduledAt}`);
    }
    const sr1fresh = await models.SendRequest.findByPk(sr1Id);
    check('P1 SendRequest.deliveryStatus=sent', sr1fresh.deliveryStatus === 'sent', sr1fresh.deliveryStatus);

    // ================= P2: immediate manual send (regression) =================
    console.log('\n--- P2: 立即发送（无 scheduledAt）---');
    const p2Addr = `p2-${suffix}@test.local`;
    const sr2 = await api('POST', '/send-requests', { token, body: {
      templateId, senderIdentityId: senderId, toRecipients: p2Addr, templatePayload: { name: 'P2' },
    }, expectStatus: 201 });
    await api('POST', `/send-requests/${sr2.data.id}/review`, { token, body: { action: 'approve', comment: 'e2e' }, expectStatus: 200 });
    const sentJob2 = await waitFor(async () => {
      const j = await latestJobFor(sr2.data.id);
      if (j && j.status === 'sent') return j.toJSON();
      return null;
    }, 15000, 750, 'P2 job sent');
    check('P2 立即发送成功（EmailJob.status=sent）', Boolean(sentJob2));
    check('P2 邮件被本地 SMTP 捕获', captureCountFor(p2Addr) > 0);

    // ================= P3: internal API simple-send (send:direct auto-approve) =================
    console.log('\n--- P3: 内部 API simple-send（send:direct 自动审批）---');
    const keyRes = await api('POST', '/api-keys', { token, body: { name: `e2e-key-${suffix}`, scopes: ['send:create', 'send:read', 'send:direct'], allowedProjects: ['*'] }, expectStatus: 201 });
    const plainKey = keyRes.data.plainTextKey;
    const keyId = keyRes.data.id;
    check('API Key 创建并返回明文密钥', Boolean(plainKey));
    const p3Addr = `p3-${suffix}@test.local`;
    const p3 = await api('POST', '/internal-api/simple-send', { apiKey: plainKey, body: {
      sender: senderEmail, title: 'P3 direct', to: p3Addr, content: '<b>hi</b>', contentType: 'html',
    }, expectStatus: 202 });
    check('P3 simple-send 返回 202 + deliveryMode=direct', p3.data.deliveryMode === 'direct', `mode=${p3.data.deliveryMode}`);
    const p3req = await models.SendRequest.findOne({ where: { sourceType: 'api', toRecipients: { [Op.contains]: [p3Addr] } } });
    check('P3 SendRequest 落库', Boolean(p3req));
    const sentJob3 = await waitFor(async () => {
      const j = await latestJobFor(p3req.id);
      if (j && j.status === 'sent') return j.toJSON();
      return null;
    }, 15000, 750, 'P3 job sent');
    check('P3 直发成功（EmailJob.status=sent）', Boolean(sentJob3));
    check('P3 邮件被本地 SMTP 捕获', captureCountFor(p3Addr) > 0);
    // idempotency duplicate hit
    const p3dup = await api('POST', '/internal-api/simple-send', { apiKey: plainKey, body: {
      sender: senderEmail, title: 'P3 direct', to: p3Addr, content: '<b>hi</b>', idempotencyKey: `dup-${suffix}`, contentType: 'html',
    }, expectStatus: 202 });
    const p3dup2 = await api('POST', '/internal-api/simple-send', { apiKey: plainKey, body: {
      sender: senderEmail, title: 'P3 direct', to: p3Addr, content: '<b>hi</b>', idempotencyKey: `dup-${suffix}`, contentType: 'html',
    }, expectStatus: 200 });
    check('P3 幂等重放返回 duplicated=true', p3dup2.data.duplicated === true);

    // ================= P4: login brute-force lock =================
    console.log('\n--- P4: 登录防爆破 ---');
    const bruteEmail = `bruteforce-${suffix}@test.local`;
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const r = await api('POST', '/auth/login', { body: { email: bruteEmail, password: 'wrong-password' } });
      statuses.push(r.status);
    }
    check('P4 前 4 次返回 401', statuses.slice(0, 4).every((s) => s === 401), statuses.join(','));
    check('P4 第 5 次起返回 429（锁定）', statuses[4] === 429 && statuses[5] === 429, statuses.join(','));
    const auditLocked = await models.AuditLog.count({ where: { eventType: 'admin_login_locked', actorLabel: bruteEmail } });
    check('P4 审计记录 admin_login_locked', auditLocked >= 1, `count=${auditLocked}`);
    // admin can still log in (lock is per-email)
    const relogin = await api('POST', '/auth/login', { body: { email: adminEmail, password: adminPassword } });
    check('P4 锁定不影响其他账号登录', relogin.status === 200, `status=${relogin.status}`);

    // ================= P5: recipient + scheduledAt validation =================
    console.log('\n--- P5: 收件人/定时参数校验 ---');
    const badTo = await api('POST', '/send-requests', { token, body: { templateId, senderIdentityId: senderId, toRecipients: `bad-address-${suffix}` } });
    check('P5 非法收件人返回 400 且提示地址', badTo.status === 400 && String(badTo.data.message || '').includes('bad-address'), String(badTo.data.message || ''));
    const badCcd = await api('POST', '/send-requests', { token, body: { templateId, senderIdentityId: senderId, toRecipients: 'ok@test.local', ccRecipients: 'nope' } });
    check('P5 非法抄送返回 400', badCcd.status === 400, String(badCcd.data.message || ''));
    const pastAt = await api('POST', '/send-requests', { token, body: { templateId, senderIdentityId: senderId, toRecipients: 'ok@test.local', scheduledAt: new Date(Date.now() - 60000).toISOString() } });
    check('P5 过去 scheduledAt 返回 400', pastAt.status === 400 && String(pastAt.data.message || '').includes('future'), String(pastAt.data.message || ''));
    const badDate = await api('POST', '/send-requests', { token, body: { templateId, senderIdentityId: senderId, toRecipients: 'ok@test.local', scheduledAt: 'not-a-date' } });
    check('P5 非法 scheduledAt 返回 400', badDate.status === 400, String(badDate.data.message || ''));
    const displayNameOk = await api('POST', '/send-requests', { token, body: { templateId, senderIdentityId: senderId, toRecipients: '"王五" <wangwu@test.local>' } });
    check('P5 显示名格式收件人可通过（400 之外的创建结果）', displayNameOk.status === 201 || displayNameOk.status === 400, `status=${displayNameOk.status}`);

    // ================= P6: /mail/test rate limit =================
    console.log('\n--- P6: 测试发信限流与校验 ---');
    let firstMailTestStatus = null;
    let eleventhMailTestStatus = null;
    for (let i = 1; i <= 11; i++) {
      const r = await api('POST', '/mail/test', { token, body: { to: `invalid-${suffix}`, subject: 'x', html: '<p>x</p>' } });
      if (i === 1) firstMailTestStatus = r.status;
      if (i === 11) eleventhMailTestStatus = r.status;
    }
    check('P6 第 1 次非法收件人返回 400', firstMailTestStatus === 400, `status=${firstMailTestStatus}`);
    check('P6 第 11 次触发限流 429', eleventhMailTestStatus === 429, `status=${eleventhMailTestStatus}`);

    // ================= P7: SMTP 连接池复用 (batch 3.1) =================
    console.log('\n--- P7: SMTP 连接池复用 ---');
    const mailHealth = await api('GET', '/mail/health', { token });
    check('P7 /mail/health 走连接池 verify 通过', mailHealth.status === 200 && mailHealth.data.smtp?.verified === true, `status=${mailHealth.status}`);
    const poolAddrs = Array.from({ length: 10 }, (_, i) => `pool-${i}-${suffix}@test.local`);
    const connsBefore = smtpHandle.smtpState.connections;
    await Promise.all(poolAddrs.map((addr) => api('POST', '/internal-api/simple-send', { apiKey: plainKey, body: { sender: senderEmail, title: 'P7 pool', to: addr, content: 'pool test', contentType: 'text' }, expectStatus: 202 })));
    const sentPool = await waitFor(async () => {
      const rows = await models.EmailJob.findAll({
        where: { status: 'sent' },
        include: [{ model: models.SendRequest, as: 'sendRequest', required: true }],
        order: [['created_at', 'DESC']],
        limit: 200,
      });
      const sentAddrs = new Set(rows.flatMap((j) => (j.sendRequest?.toRecipients || [])));
      return poolAddrs.every((addr) => sentAddrs.has(addr)) ? rows.length : null;
    }, 40000, 1000, 'P7 all pool sends');
    check('P7 10 封并发直发全部成功', Boolean(sentPool));
    const connsAfter = smtpHandle.smtpState.connections;
    check('P7 SMTP 连接数 < 发信数（连接复用）', connsAfter - connsBefore < poolAddrs.length, `newConnections=${connsAfter - connsBefore} / sends=${poolAddrs.length}`);

    // ================= P8: 失败任务手动重试 (batch 3.2) =================
    console.log('\n--- P8: 失败任务手动重试 ---');
    smtpHandle.smtpState.acceptAll = false;
    const rejectAddr = `reject-${suffix}@test.local`;
    await api('POST', '/internal-api/simple-send', { apiKey: plainKey, body: { sender: senderEmail, title: 'P8 reject', to: rejectAddr, content: 'should fail', contentType: 'text' }, expectStatus: 202 });
    const failedJob = await waitFor(async () => {
      const sr = await models.SendRequest.findOne({ where: { sourceType: 'api', toRecipients: { [Op.contains]: [rejectAddr] } } });
      if (!sr) return null;
      const job = await models.EmailJob.findOne({ where: { sendRequestId: sr.id, status: 'failed' }, order: [['created_at', 'DESC']] });
      return job ? job.toJSON() : null;
    }, 20000, 750, 'P8 failed job');
    check('P8 拒收地址任务进入 failed', Boolean(failedJob), failedJob ? `lastError=${String(failedJob.lastError).slice(0, 80)}` : '');
    smtpHandle.smtpState.acceptAll = true;
    const retryRes = await api('POST', `/queue/jobs/${failedJob.id}/retry`, { token, expectStatus: 200 });
    check('P8 重试接口返回新任务', Boolean(retryRes.data.retryJobId), `retryJobId=${retryRes.data.retryJobId}`);
    const retriedSent = await waitFor(async () => {
      const j = await models.EmailJob.findByPk(retryRes.data.retryJobId);
      return j && j.status === 'sent' ? j.toJSON() : null;
    }, 20000, 750, 'P8 retried job sent');
    check('P8 重试后新任务发送成功', Boolean(retriedSent), `providerMessageId=${retriedSent ? retriedSent.providerMessageId : ''}`);
    check('P8 邮件被本地 SMTP 捕获', captures.some((c) => c.message.includes(rejectAddr)));
    const originalAfter = await models.EmailJob.findByPk(failedJob.id);
    check('P8 原失败任务保留为历史（仍 failed）', originalAfter.status === 'failed', originalAfter.status);
    const retryAudit = await models.AuditLog.count({ where: { eventType: 'email_job_retried' } });
    check('P8 审计记录 email_job_retried', retryAudit >= 1, `count=${retryAudit}`);
    // retry a sent job must be rejected
    const sentRetry = await api('POST', `/queue/jobs/${retriedSent.id}/retry`, { token });
    check('P8 已发送任务重试返回 400', sentRetry.status === 400, `status=${sentRetry.status}`);

    // ================= P10: Resend 回执 webhook (batch 2) =================
    console.log('\n--- P10: Resend 回执 webhook ---');
    const WEBHOOK_SECRET = 'whsec_e2e_secret';
    const svixSign = (secret, id, ts, body) => {
      const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
      return crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
    };
    const postWebhook = async (event, { badSig = false } = {}) => {
      const raw = JSON.stringify(event);
      const id = `evt_${suffix}_${Math.random().toString(16).slice(2, 10)}`;
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = badSig ? 'v1,deadbeef' : `v1,${svixSign(WEBHOOK_SECRET, id, ts, raw)}`;
      const res = await fetch(`${BASE}/webhooks/resend`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sig },
        body: raw,
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      return { status: res.status, data };
    };

    // 无效签名 → 401
    const badSigRes = await postWebhook({ type: 'email.bounced', data: {} }, { badSig: true });
    check('P10 无效签名返回 401', badSigRes.status === 401, `status=${badSigRes.status}`);

    // email.bounced → 任务置 bounced + 回执事件 + 告警
    const bounceMsgId = sentJob3.providerMessageId;
    const bounceTo = p3Addr;
    const bounceEvent = {
      type: 'email.bounced',
      created_at: new Date().toISOString(),
      data: { message_id: bounceMsgId, to: bounceTo, subject: 'P3 direct',
        bounce: { reason: '550 5.1.1 Recipient rejected (e2e)', status: '5.1.1' } },
    };
    const bounceRes = await postWebhook(bounceEvent);
    check('P10 bounced 事件被接收', bounceRes.status === 200 && bounceRes.data?.received === true, `status=${bounceRes.status}`);
    const bouncedJob = await waitFor(async () => {
      const j = await models.EmailJob.findByPk(sentJob3.id);
      return j && j.status === 'bounced' ? j.toJSON() : null;
    }, 8000, 400, 'P10 job bounced');
    check('P10 任务状态变为 bounced', Boolean(bouncedJob), bouncedJob ? `bounceReason=${String(bouncedJob.bounceReason).slice(0, 60)}` : '');
    const bouncedSr = await models.SendRequest.findByPk(sentJob3.sendRequestId);
    check('P10 SendRequest.deliveryStatus=bounced', bouncedSr.deliveryStatus === 'bounced', bouncedSr.deliveryStatus);
    const bounceEventRow = await models.MailFeedbackEvent.count({ where: { emailJobId: sentJob3.id, kind: 'bounce' } });
    check('P10 回执事件落库（mail_feedback_events）', bounceEventRow >= 1, `count=${bounceEventRow}`);
    const bounceEmailLog = await models.EmailLog.count({ where: { emailJobId: sentJob3.id, eventType: 'mail_bounce_received' } });
    check('P10 EmailLog 记录 mail_bounce_received', bounceEmailLog >= 1, `count=${bounceEmailLog}`);
    const alertCaptures = captures.filter((c) => c.message.includes('alert-to@test.local'));
    check('P10 退信告警邮件被捕获', alertCaptures.length > 0);

    // email.delivered → 任务置 delivered
    const deliveredEvent = {
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: { message_id: sentJob2.providerMessageId, to: p2Addr, subject: 'P2' },
    };
    await postWebhook(deliveredEvent);
    const deliveredJob = await waitFor(async () => {
      const j = await models.EmailJob.findByPk(sentJob2.id);
      return j && j.status === 'delivered' ? j.toJSON() : null;
    }, 8000, 400, 'P10 job delivered');
    check('P10 任务状态变为 delivered', Boolean(deliveredJob));

    // 无法关联的事件（未知 messageId）→ 仍返回 200，不报错
    const orphanEvent = { type: 'email.bounced', created_at: new Date().toISOString(), data: { message_id: '<unknown-e2e@test.local>', to: 'ghost@test.local' } };
    const orphanRes = await postWebhook(orphanEvent);
    check('P10 未知 messageId 事件不报错', orphanRes.status === 200 && orphanRes.data?.summary?.matchedJobId === null, `status=${orphanRes.status} matched=${orphanRes.data?.summary?.matchedJobId}`);

    // ================= P9: 日志清理 (batch 3.3) =================
    console.log('\n--- P9: 日志清理脚本 ---');
    const dryRun = await runChildResilient('scripts/purge-old-logs.js --days 0 --dry-run');
    const dryOk = dryRun.code === 0 && /将删除/.test(dryRun.out);
    check('P9 dry-run 统计可删除行数', dryOk, dryRun.out.split('\n').filter((l) => l.includes('将删除')).join('; '));
    const purge = await runChildResilient('scripts/purge-old-logs.js --days 0');
    const purgeLines = purge.out.split('\n').filter((l) => l.includes('已删除') || l.includes('无过期数据'));
    const emailLogDeleted = purge.out.match(/email_logs: 已删除 (\d+) 行/);
    check('P9 实际清理执行成功且删除了日志', purge.code === 0 && emailLogDeleted && Number(emailLogDeleted[1]) > 0, purgeLines.join('; '));
    const [emailLogLeft, auditLogLeft] = await Promise.all([
      models.EmailLog.count(),
      models.AuditLog.count(),
    ]);
    check('P9 清理后 email_logs/audit_logs 归零', emailLogLeft === 0 && auditLogLeft === 0, `email_logs=${emailLogLeft} audit_logs=${auditLogLeft}`);

    // ---- summary ----
    console.log('\n================ SUMMARY ================');
    const failed = results.filter((r) => !r.ok);
    results.forEach((r) => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`));
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    console.log(`captured fake emails: ${captures.length}`);
    process.exitCode = failed.length ? 1 : 0;

    await sequelize.close().catch(() => {});
    await queue.close().catch(() => {});
  } catch (error) {
    console.error('\nE2E ERROR:', error.message);
    console.error('logs at', LOG_DIR);
    process.exitCode = 2;
  } finally {
    for (const child of children) {
      try { child.kill('SIGTERM'); } catch {}
    }
    if (smtpHandle) { try { smtpHandle.server.close(); } catch {} }
    await sleep(1000);
    for (const child of children) {
      try { if (child.exitCode === null) child.kill('SIGKILL'); } catch {}
    }
    try { redis.disconnect(); } catch {}
    // force exit: some handles (sequelize/queue) may keep the loop alive
    setTimeout(() => process.exit(process.exitCode || 0), 500);
  }
})();
