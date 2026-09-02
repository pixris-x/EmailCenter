const path = require('node:path');
const dotenv = require('dotenv');

const candidatePaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
];

for (const candidatePath of candidatePaths) {
  dotenv.config({ path: candidatePath, override: false });
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function normalizeRelativePath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function resolveStoragePath(value, fallbackRelativePath) {
  const target = value || fallbackRelativePath;
  return path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
}

function resolveStorageRelativePath(value, fallbackRelativePath) {
  const target = value || fallbackRelativePath;

  if (!path.isAbsolute(target)) {
    return normalizeRelativePath(target);
  }

  const relative = path.relative(process.cwd(), target);
  return normalizeRelativePath(relative || fallbackRelativePath);
}

const env = {
  app: {
    name: process.env.APP_NAME || 'Email Center',
    env: process.env.APP_ENV || 'development',
    port: toNumber(process.env.APP_PORT, 3000),
    host: process.env.APP_HOST || '0.0.0.0',
    baseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
    webUrl: process.env.APP_WEB_URL || 'http://localhost:5173',
    jwtSecret: process.env.APP_JWT_SECRET || '',
    jwtExpiresIn: process.env.APP_JWT_EXPIRES_IN || '12h',
    encryptionKey: process.env.APP_ENCRYPTION_KEY || '',
    loginMaxFailures: toNumber(process.env.APP_LOGIN_MAX_FAILURES, 5),
    loginLockMinutes: toNumber(process.env.APP_LOGIN_LOCK_MINUTES, 30),
    loginIpMaxPerMinute: toNumber(process.env.APP_LOGIN_IP_MAX_PER_MINUTE, 10),
  },
  database: {
    host: process.env.DB_HOST || '',
    port: toNumber(process.env.DB_PORT, 5432),
    name: process.env.DB_NAME || '',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    schema: process.env.DB_SCHEMA || 'public',
    sslEnabled: toBoolean(process.env.DB_SSL, false),
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: toNumber(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || '',
  },
  smtp: {
    host: process.env.RESEND_SMTP_HOST || 'smtp.resend.com',
    port: toNumber(process.env.RESEND_SMTP_PORT, 465),
    user: process.env.RESEND_SMTP_USER || 'resend',
    pass: process.env.RESEND_SMTP_PASS || '',
    defaultFromName: process.env.MAIL_DEFAULT_FROM_NAME || 'Pixris',
    defaultFromEmail: process.env.MAIL_DEFAULT_FROM_EMAIL || 'noreply@email.pixris.online',
    attachmentMaxMb: toNumber(process.env.MAIL_ATTACHMENT_MAX_MB, 10),
    allowedAttachmentExtensions: (process.env.MAIL_ALLOWED_ATTACHMENT_EXTENSIONS || '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
    allowedAttachmentMimeTypes: (process.env.MAIL_ALLOWED_ATTACHMENT_MIME_TYPES || 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,application/zip,application/x-zip-compressed')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  },
  storage: {
    // 上传文件写入绝对目录，但数据库里只保存相对路径，便于 Linux 迁移部署。
    attachmentDir: resolveStoragePath(process.env.APP_ATTACHMENT_DIR, './storage/attachments'),
    attachmentDirRelative: resolveStorageRelativePath(process.env.APP_ATTACHMENT_DIR, './storage/attachments'),
  },
  queue: {
    emailName: process.env.QUEUE_EMAIL_NAME || 'email-send',
    emailConcurrency: toNumber(process.env.QUEUE_EMAIL_CONCURRENCY, 1),
    emailMaxRetries: toNumber(process.env.QUEUE_EMAIL_MAX_RETRIES, 3),
  },
  internalApi: {
    rateLimitPerMinute: toNumber(process.env.INTERNAL_API_RATE_LIMIT_PER_MINUTE, 30),
  },
  mail: {
    // 发送失败/退信时的告警接收邮箱
    alertTo: process.env.MAIL_ALERT_TO || '',
  },
  webhook: {
    // Resend 回执 webhook 签名密钥（whsec_...）；为空时不校验（仅开发）。
    resendSecret: process.env.RESEND_WEBHOOK_SECRET || '',
    // 允许的回执事件时间戳容差（秒）
    timestampToleranceSeconds: toNumber(process.env.RESEND_WEBHOOK_TOLERANCE_SECONDS, 300),
  },
};

// 生产环境必需配置校验：缺关键密钥时直接拒绝启动，避免带病上线。
// 非生产环境仅返回问题清单，由调用方决定是否告警。
function validateRequiredConfig() {
  const isProduction = env.app.env === 'production';
  const problems = [];

  function requireSecret(key, value, { minLength = 0 } = {}) {
    const current = String(value || '').trim();
    if (!current || (minLength && current.length < minLength)) {
      problems.push(`${key} 缺失${minLength ? `（至少 ${minLength} 字符）` : ''}`);
    }
  }

  function requireHttpsUrl(key, value) {
    if (!String(value || '').startsWith('https://')) {
      problems.push(`${key} 必须是 https 地址`);
    }
  }

  requireSecret('APP_JWT_SECRET', env.app.jwtSecret, { minLength: 32 });
  requireSecret('RESEND_SMTP_PASS', env.smtp.pass);
  requireSecret('DB_HOST', env.database.host);

  if (isProduction) {
    requireHttpsUrl('APP_BASE_URL', env.app.baseUrl);
    requireHttpsUrl('APP_WEB_URL', env.app.webUrl);
  }

  if (isProduction && problems.length) {
    throw new Error(
      `生产环境配置校验失败，拒绝启动：\n- ${problems.join('\n- ')}\n请先在 .env 中补齐上述配置。`,
    );
  }

  return { problems };
}

module.exports = { env, validateRequiredConfig };
