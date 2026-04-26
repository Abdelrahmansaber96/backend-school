const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const mongoose = require('mongoose');

const app = require('../src/app');
const AuditLog = require('../src/models/AuditLog.model');
const { seedQaDataset } = require('../scripts/seed-realistic');

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