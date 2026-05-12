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