const test = require('node:test');
const assert = require('node:assert/strict');

const { __testables } = require('../src/services/student.service');

test('student import resolves a class by section and grade', () => {
  const classes = [
    { _id: 'class-1a', name: 'الأول أ', grade: '1', section: 'أ' },
    { _id: 'class-1b', name: 'الأول ب', grade: '1', section: 'ب' },
  ];

  const resolved = __testables.findClassForImportRow(classes, {
    classRef: 'أ',
    gradeRef: '١',
  });

  assert.equal(resolved?._id, 'class-1a');
});

test('student import resolves a class when the sheet uses latin section labels', () => {
  const classes = [
    { _id: 'class-4a', name: 'الرابع أ', grade: '4', section: 'أ' },
  ];

  const resolved = __testables.findClassForImportRow(classes, {
    classRef: 'A',
    gradeRef: 'الرابع',
  });

  assert.equal(resolved?._id, 'class-4a');
});

test('student import builds a class payload from grade and section when class does not exist', () => {
  const payload = __testables.buildImportedClassPayload({
    classRef: 'أ',
    gradeRef: '١',
  });

  assert.deepEqual(payload, {
    name: '١ أ',
    grade: '1',
    section: 'أ',
    academicYear: payload.academicYear,
  });
  assert.match(payload.academicYear, /^\d{4}-\d{4}$/);
});

test('student import skips auto-creating a class when the sheet has no usable class data', () => {
  assert.equal(__testables.buildImportedClassPayload({ classRef: '', gradeRef: '' }), null);
  assert.equal(__testables.buildImportedClassPayload({ classRef: 'أ', gradeRef: '' }), null);
});

test('student import reads an optional additional phone and relationship from Arabic headers', () => {
  const row = __testables.normalizeImportRow({
    rowNumber: 2,
    row: {
      'اسم الطالب': 'أحمد محمد',
      'رقم الهوية': '1234567890',
      الصف: 'الأول',
      'رقم الجوال': '0500000000',
      'رقم جوال إضافي': '0555555555',
      'صلة القرابة': 'الأم',
    },
  });

  assert.equal(row.fullName, 'أحمد محمد');
  assert.equal(row.nationalId, '1234567890');
  assert.equal(row.gradeRef, 'الأول');
  assert.equal(row.phone, '0500000000');
  assert.equal(row.additionalPhone, '0555555555');
  assert.equal(row.additionalPhoneRelationship, 'الأم');
});
