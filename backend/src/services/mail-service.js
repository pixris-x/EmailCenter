const { createSmtpTransport, getDefaultFromAddress } = require('../config/smtp');

function mapTransportResult(info) {
  return {
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
    messageId: info.messageId,
  };
}

async function verifySmtpConnection() {
  const transporter = createSmtpTransport();
  try {
    await transporter.verify();
    return { verified: true };
  } finally {
    transporter.close();
  }
}

async function sendMailMessage(message) {
  const transporter = createSmtpTransport();

  try {
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
  } finally {
    transporter.close();
  }
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
