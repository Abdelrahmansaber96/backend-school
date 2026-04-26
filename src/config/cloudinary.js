const cloudinary = require('cloudinary').v2;
const config = require('./env');

const isConfigured = Boolean(
  config.CLOUDINARY_CLOUD_NAME
  && config.CLOUDINARY_API_KEY
  && config.CLOUDINARY_API_SECRET,
);

if (isConfigured) {
  cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

cloudinary.isConfigured = isConfigured;

module.exports = cloudinary;
