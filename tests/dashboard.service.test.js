const test = require('node:test');
const assert = require('node:assert/strict');

const { __testables } = require('../src/services/dashboard.service');

test('dashboard ranges cover the requested number of inclusive days', () => {
  const now = new Date('2026-08-13T12:00:00.000Z');
  assert.equal(__testables.buildPeriod('today', now).days, 1);
  assert.equal(__testables.buildPeriod('7d', now).days, 7);
  assert.equal(__testables.buildPeriod('30d', now).days, 30);
});

test('dashboard rejects unknown ranges by falling back to today', () => {
  const period = __testables.buildPeriod('year', new Date('2026-08-13T12:00:00.000Z'));
  assert.equal(period.range, 'today');
  assert.equal(period.days, 1);
});

test('dashboard KPI comparison handles zero and directions', () => {
  assert.deepEqual(__testables.comparison(0, 0), { value: 0, previousValue: 0, changePercent: 0, direction: 'stable' });
  assert.equal(__testables.comparison(4, 0).changePercent, 100);
  assert.equal(__testables.comparison(3, 6).direction, 'down');
  assert.equal(__testables.comparison(8, 4).direction, 'up');
});
