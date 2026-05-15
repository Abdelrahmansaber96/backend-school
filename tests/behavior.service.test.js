const test = require('node:test');
const assert = require('node:assert/strict');

const { __testables } = require('../src/services/behavior.service');

test('behavior allows school admin recording when class has no assigned teacher', () => {
  const teacherId = __testables.resolveBehaviorTeacherIdForClass(
    { teacherId: null },
    { role: 'school_admin' },
  );

  assert.equal(teacherId, null);
});

test('behavior keeps the class teacher when one is assigned', () => {
  const teacherId = __testables.resolveBehaviorTeacherIdForClass(
    { teacherId: 'teacher-1' },
    { role: 'administrative' },
  );

  assert.equal(teacherId, 'teacher-1');
});