const test = require('node:test');
const assert = require('node:assert/strict');

const reportService = require('../src/services/report.service');
const { buildCsv } = require('../src/utils/csv');

const { __testables } = reportService;

test('csv export prefixes UTF-8 BOM so Arabic headers open correctly in Excel', () => {
  const csv = buildCsv([
    { key: 'date', label: 'التاريخ' },
    { key: 'total', label: 'الإجمالي' },
  ], [
    { date: '2026-01-15', total: 3 },
  ]);

  assert.ok(csv.startsWith('\uFEFFالتاريخ,الإجمالي'));
});

test('attendance export definition is localized to Arabic', () => {
  const definition = __testables.buildAttendanceExportDefinition({
    period: {
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
    },
    daily: [
      { date: '2026-01-15', total: 10, absence: 2, late: 1, permission: 1 },
    ],
    totals: { total: 10, absence: 2, late: 1, permission: 1 },
    summary: { totalStudents: 20, attendanceRate: 85.5, absenceRate: 10.0 },
  }, { format: 'xlsx' });

  assert.equal(definition.title, 'تقرير الحضور');
  assert.equal(definition.sheetName, 'الحضور');
  assert.deepEqual(definition.columns.map((column) => column.label), [
    'التاريخ',
    'إجمالي السجلات',
    'غياب',
    'تأخر',
    'إذن',
  ]);
  assert.equal(definition.rows.at(-1).date, 'الإجمالي');
});

test('behavior export definition localizes labels and values to Arabic', () => {
  const definition = __testables.buildBehaviorExportDefinition({
    positive: 3,
    negative: 1,
    summary: { positiveRate: 75 },
    records: [
      {
        createdAt: '2026-01-15T10:30:00.000Z',
        studentId: {
          nationalId: '1234567890',
          userId: { name: { first: 'أحمد', last: 'علي' } },
        },
        classId: { name: '5-A', grade: '5' },
        type: 'positive',
        category: 'التزام',
        description: 'التزم بالواجبات المطلوبة.',
        attachments: [{ url: 'https://example.com/file.pdf' }],
        notifyParent: true,
      },
    ],
  }, { startDate: '2026-01-01', endDate: '2026-01-31', format: 'csv' });

  assert.equal(definition.title, 'تقرير السلوك');
  assert.equal(definition.sheetName, 'السلوك');
  assert.deepEqual(definition.columns.map((column) => column.label), [
    'تاريخ التسجيل',
    'اسم الطالب',
    'رقم الهوية',
    'الفصل',
    'الصف',
    'النوع',
    'الفئة',
    'الوصف',
    'عدد المرفقات',
    'إشعار ولي الأمر',
  ]);
  assert.equal(definition.rows[0].type, 'إيجابي');
  assert.equal(definition.rows[0].notifyParent, 'نعم');
  assert.ok(definition.rows[0].createdAt);
});