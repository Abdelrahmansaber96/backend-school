const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const mongoose = require('mongoose');

const app = require('../src/app');
const AuditLog = require('../src/models/AuditLog.model');
const { seedQaDataset } = require('../scripts/seed-realistic');
const authService = require('../src/services/auth.service');

const API_PREFIX = process.env.API_PREFIX || '/api/v1';

test('login creates an audit log entry', async (t) => {
  const seed = await seedQaDataset({ reset: true, disconnect: false, silent: true });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const beforeCount = await AuditLog.countDocuments({ schoolId: seed.school.id, action: 'login' });

  const response = await fetch(`${origin}${API_PREFIX}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-School-Subdomain': seed.school.subdomain,
    },
    body: JSON.stringify({
      identifier: seed.credentials.admin.nationalId,
      identifierType: 'nationalId',
      password: seed.credentials.admin.password,
    }),
  });

  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.success, true);

  const afterCount = await AuditLog.countDocuments({ schoolId: seed.school.id, action: 'login' });
  assert.equal(afterCount, beforeCount + 1);
});

test('production login cookies are compatible with cross-site frontend requests', async (t) => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCookieSameSite = process.env.COOKIE_SAME_SITE;
  const originalCloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const originalCloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
  const originalCloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
  const originalLogin = authService.login;

  process.env.NODE_ENV = 'production';
  process.env.CLOUDINARY_CLOUD_NAME = originalCloudinaryCloudName || 'test-cloud';
  process.env.CLOUDINARY_API_KEY = originalCloudinaryApiKey || 'test-key';
  process.env.CLOUDINARY_API_SECRET = originalCloudinaryApiSecret || 'test-secret';
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/controllers/auth.controller')];

  authService.login = async () => ({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    user: {
      _id: 'user-id',
      role: 'admin',
      schoolId: 'school-id',
      name: 'Admin User',
      mustChangePassword: false,
    },
  });

  const { login } = require('../src/controllers/auth.controller');
  const cookieCalls = [];
  const req = {
    body: {
      identifier: '12345678901234',
      password: 'secret',
      identifierType: 'nationalId',
    },
    ip: '127.0.0.1',
    get: () => 'node-test',
  };
  const res = {
    statusCode: null,
    payload: null,
    cookie(name, value, options) {
      cookieCalls.push({ name, value, options });
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  t.after(() => {
    authService.login = originalLogin;

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalCookieSameSite === undefined) {
      delete process.env.COOKIE_SAME_SITE;
    } else {
      process.env.COOKIE_SAME_SITE = originalCookieSameSite;
    }

    if (originalCloudinaryCloudName === undefined) {
      delete process.env.CLOUDINARY_CLOUD_NAME;
    } else {
      process.env.CLOUDINARY_CLOUD_NAME = originalCloudinaryCloudName;
    }

    if (originalCloudinaryApiKey === undefined) {
      delete process.env.CLOUDINARY_API_KEY;
    } else {
      process.env.CLOUDINARY_API_KEY = originalCloudinaryApiKey;
    }

    if (originalCloudinaryApiSecret === undefined) {
      delete process.env.CLOUDINARY_API_SECRET;
    } else {
      process.env.CLOUDINARY_API_SECRET = originalCloudinaryApiSecret;
    }

    delete require.cache[require.resolve('../src/config/env')];
    delete require.cache[require.resolve('../src/controllers/auth.controller')];
  });

  await login(req, res, (error) => {
    if (error) {
      throw error;
    }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(cookieCalls.length, 2);

  for (const { options } of cookieCalls) {
    assert.equal(options.secure, true);
    assert.equal(options.sameSite, 'none');
    assert.equal(options.httpOnly, true);
  }
});