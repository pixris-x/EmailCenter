const nodemailer = require('nodemailer');
const { env } = require('./env');

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
    auth: {
      user: env.smtp.user,
      pass: env.smtp.pass,
    },
  });
}

function getDefaultFromAddress() {
  return `"${env.smtp.defaultFromName}" <${env.smtp.defaultFromEmail}>`;
}

module.exports = {
  assertSmtpConfiguration,
  createSmtpTransport,
  getDefaultFromAddress,
};