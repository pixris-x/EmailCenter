const { getSmtpTransport, getDefaultFromAddress } = require('../config/smtp');
const { validateRecipientList } = require('../utils/email-utils');

function mapTransportResult(info) {
  return {
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
    messageId: info.messageId,
  };
}

function assertValidMessageRecipients(message) {
  for (const field of ['to', 'cc', 'bcc']) {
    const value = message[field];
    if (value === undefined || value === null || value === '') {
      continue;
    }

    validateRecipientList(value, { field });
  }
}

async function verifySmtpConnection() {
  const transporter = getSmtpTransport();
  const result = await transporter.verify();
  return { verified: Boolean(result) };
}

async function sendMailMessage(message) {
  // 兜底校验：即使上层入口遗漏，也不允许向非法地址发信。
  assertValidMessageRecipients(message);

  // 复用进程级连接池，不再每次新建/关闭连接。
  const transporter = getSmtpTransport();

  const info = await transporter.sendMail({
    from: message.from || getDefaultFromAddress(),
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    replyTo: message.replyTo,
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments: message.attachments || [],
  });

  return mapTransportResult(info);
}

async function sendTestEmail({ to, subject, html, text, from }) {
  return sendMailMessage({
    from,
    to,
    subject: subject || 'Email Center SMTP test',
    html: html || '<p>This is a test email from Email Center.</p>',
    text: text || 'This is a test email from Email Center.',
  });
}

module.exports = {
  verifySmtpConnection,
  sendMailMessage,
  sendTestEmail,
};
