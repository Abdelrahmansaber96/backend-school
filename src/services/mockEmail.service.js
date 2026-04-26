const nodemailer = require('nodemailer');
const config = require('../config/env');
const logger = require('../utils/logger');

const transporter = nodemailer.createTransport({
  jsonTransport: true,
});

const sendMockEmail = async ({ to, subject, text, metadata = {} }) => {
  const info = await transporter.sendMail({
    from: config.EMAIL_FROM,
    to,
    subject,
    text,
    headers: {
      'X-Basma-Mock-Email': 'true',
    },
  });

  logger.info(`Mock email sent to ${to}: ${subject}`);

  return {
    messageId: info.messageId || null,
    payload: info.message,
    metadata,
  };
};

module.exports = {
  sendMockEmail,
};