const test = require('node:test');
const assert = require('node:assert/strict');

const { __testables } = require('../src/services/class.service');

test('class import derives class name from grade and section when name is missing', () => {
  const derivedName = __testables.buildImportedClassName({
    grade: 'الأول',
    section: 'أ',
  });

  assert.equal(derivedName, 'الأول أ');
});

test('class import normalizes academic year from Arabic digits and start year input', () => {
  assert.equal(__testables.normalizeAcademicYearValue('١٤٤٦-١٤٤٧'), '1446-1447');
  assert.equal(__testables.normalizeAcademicYearValue('1446'), '1446-1447');
});