const bcrypt = require('bcryptjs');
const config = require('../config/env');

const hashPassword = (plain) => bcrypt.hash(plain, config.BCRYPT_ROUNDS);

const comparePassword = (plain, hashed) => bcrypt.compare(plain, hashed);

const generateTempPassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let pass = '';
  for (let i = 0; i < 8; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${pass}@1`; // Meets min policy: uppercase, lowercase, digit, special
};

module.exports = { hashPassword, comparePassword, generateTempPassword };
