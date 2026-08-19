const nodemailer = require('nodemailer');
const config = require('../config/env');
const logger = require('../utils/logger');

const hasSmtp = Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS);
const transporter = hasSmtp
  ? nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  })
  : nodemailer.createTransport({ jsonTransport: true });

const sendMockEmail = async ({ to, subject, text, html, metadata = {} }) => {
  const info = await transporter.sendMail({
    from: config.EMAIL_FROM,
    to,
    subject,
    text,
    html,
    headers: {
      'X-Basma-Email-Mode': hasSmtp ? 'smtp' : 'development-json',
    },
  });

  logger.info(`${hasSmtp ? 'Email' : 'Development email'} sent to ${to}: ${subject}`);

  return {
    messageId: info.messageId || null,
    payload: info.message,
    metadata,
  };
};

module.exports = {
  sendMockEmail,
};
