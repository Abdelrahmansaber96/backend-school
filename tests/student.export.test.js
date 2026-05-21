const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const studentService = require('../src/services/student.service');

test('student roster export workbook matches Arabic sheet layout and groups by class', () => {
  const buffer = studentService.__testables.buildStudentRosterWorkbookBuffer({
    school: {
      nameAr: 'مدرسة الاختبار',
      address: 'الإدارة العامة للتعليم',
      academicYear: '1446-1447',
    },
    students: [
      {
        _id: 'student-1',
        schoolId: 'school-1',
        nationalId: '1000000001',
        dateOfBirth: '2016-09-08T00:00:00.000Z',
        isActive: true,
        userId: {
          name: { first: 'محمد', last: 'علي' },
          phone: '0551234567',
          isActive: true,
        },
        classId: {
          _id: 'class-1',
          name: '1',
          grade: '4',
          section: 'أ',
          academicYear: '1446-1447',
        },
        parentId: {
          _id: 'parent-1',
          address: 'حي النزهة',
          userId: {
            name: { first: 'أحمد', last: 'علي' },
            phone: '0500000000',
          },
        },
      },
      {
        _id: 'student-2',
        schoolId: 'school-1',
        nationalId: '1000000002',
        dateOfBirth: '2015-08-01T00:00:00.000Z',
        isActive: true,
        userId: {
          name: { first: 'سارة', last: 'حسن' },
          phone: '0559876543',
          isActive: true,
        },
        classId: {
          _id: 'class-2',
          name: '2',
          grade: '5',
          section: 'ب',
          academicYear: '1446-1447',
        },
        parentId: {
          _id: 'parent-2',
          address: 'حي السلام',
          userId: {
            name: { first: 'منى', last: 'حسن' },
            phone: '0501111111',
          },
        },
      },
    ],
  });

  const workbook = XLSX.read(buffer, { type: 'buffer' });

  assert.deepEqual(workbook.SheetNames, [
    'الرابع الابتدائي - 1',
    'الخامس الابتدائي - 2',
  ]);

  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  assert.equal(firstSheet.K3.v, 'العام الدراسي');
  assert.equal(firstSheet.E3.v, '1446-1447');
  assert.equal(firstSheet.L5.v, 'الصف');
  assert.equal(firstSheet.E5.v, 'الرابع الابتدائي');
  assert.equal(firstSheet.L13.v, 'الفصل');
  assert.equal(firstSheet.E13.v, '1');
  assert.equal(firstSheet.R17.v, 'كشف الطلاب');
  assert.equal(firstSheet.Q20.v, 'إسم ولي الامر');
  assert.equal(firstSheet.AC20.v, 'اسم الطالب');
  assert.equal(firstSheet.AC21.v, 'محمد علي');
  assert.equal(firstSheet.Q21.v, 'أحمد علي');
  assert.equal(firstSheet.P21.v, '0500000000');
  assert.equal(firstSheet.U21.v, '1000000001');
  assert.equal(firstSheet.F21.v, 'حي النزهة');
  assert.match(String(firstSheet.Y21.v), /^\d{2}\/\d{2}\/\d{4}$/);
});