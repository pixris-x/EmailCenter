const nodemailer = require('nodemailer');
const { env } = require('./env');

// 进程级 SMTP 连接池：worker 与 API 进程内复用 TLS 连接，避免每封邮件重建连接。
const POOL_MAX_CONNECTIONS = 5;
const POOL_MAX_MESSAGES = 100;

let cachedTransport = null;

function assertSmtpConfiguration() {
  if (env.smtp.port !== 465) {
    throw new Error('Only SMTP port 465 is allowed in this project.');
  }

  if (!env.smtp.pass) {
    throw new Error('RESEND_SMTP_PASS is required before sending test emails.');
  }
}

function createSmtpTransport() {
  assertSmtpConfiguration();

  return nodemailer.createTransport({
    host: env.smtp.host,
    port: 465,
    secure: true,
    pool: true,
    maxConnections: POOL_MAX_CONNECTIONS,
    maxMessages: POOL_MAX_MESSAGES,
    auth: {
      user: env.smtp.user,
      pass: env.smtp.pass,
    },
  });
}

function getSmtpTransport() {
  if (!cachedTransport) {
    cachedTransport = createSmtpTransport();
    // 连接池空闲连接被服务端断开等情况会触发 error，避免未监听导致进程崩溃。
    cachedTransport.on('error', (error) => {
      console.warn(`[smtp] pooled transport error: ${error.message}`);
    });
  }

  return cachedTransport;
}

async function closeSmtpTransport() {
  if (cachedTransport) {
    try {
      await cachedTransport.close();
    } finally {
      cachedTransport = null;
    }
  }
}

function getDefaultFromAddress() {
  return `"${env.smtp.defaultFromName}" <${env.smtp.defaultFromEmail}>`;
}

module.exports = {
  assertSmtpConfiguration,
  createSmtpTransport,
  getSmtpTransport,
  closeSmtpTransport,
  getDefaultFromAddress,
};