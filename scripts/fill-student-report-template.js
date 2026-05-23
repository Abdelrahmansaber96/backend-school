const path = require('path');
const XLSX = require('xlsx');

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/fill-student-report-template.js <input.xlsx> <output.xlsx>');
  process.exit(1);
}

const studentNames = [
  'محمد علي الغامدي',
  'أحمد خالد العتيبي',
  'عبدالله سعد الحربي',
  'يوسف ماجد الزهراني',
  'عمر ناصر القحطاني',
  'سلمان فهد الشهري',
  'إبراهيم حسن المالكي',
  'تركي راشد الدوسري',
  'ريان بندر المطيري',
  'خالد عبدالعزيز العنزي',
  'أنس وليد السبيعي',
  'معاذ صالح الشهراني',
  'حمزة طارق البلوي',
  'زياد محمد اليامي',
  'سيف عبدالله القرني',
  'فارس حمدان العمري',
  'راكان عادل الجهني',
  'حاتم طلال الشمري',
  'نواف بدر القيسي',
  'باسل سامر السلمي',
  'مهند ياسر الحكمي',
  'يزيد إبراهيم الكناني',
  'مروان علي الثقفي',
  'طلال نادر العازمي',
  'هيثم صقر الفيفي',
  'عبدالرحمن وليد الهذلي',
  'أدهم حسن الحازمي',
  'إياد سعد الجابري',
  'جواد زيد البقمي',
  'قصي أحمد النجدي',
];

const guardianNames = [
  'علي حسن الغامدي',
  'خالد عبدالله العتيبي',
  'سعد محمد الحربي',
  'ماجد ناصر الزهراني',
  'ناصر فهد القحطاني',
  'فهد سالم الشهري',
  'حسن علي المالكي',
  'راشد عمر الدوسري',
  'بندر خالد المطيري',
  'عبدالعزيز صالح العنزي',
  'وليد طارق السبيعي',
  'صالح بدر الشهراني',
  'طارق يحيى البلوي',
  'محمد سامي اليامي',
  'عبدالله راشد القرني',
  'حمدان مازن العمري',
  'عادل أنور الجهني',
  'طلال زهير الشمري',
  'بدر هاني القيسي',
  'سامر جابر السلمي',
  'ياسر عبدالمجيد الحكمي',
  'إبراهيم مسفر الكناني',
  'علي نواف الثقفي',
  'نادر حسان العازمي',
  'صقر يوسف الفيفي',
  'وليد ماجد الهذلي',
  'حسن عادل الحازمي',
  'سعد فواز الجابري',
  'زيد مراد البقمي',
  'أحمد رائد النجدي',
];

const relativeNames = [
  'العم حسن',
  'الخال سامي',
  'العم خالد',
  'الخال فواز',
  'العم ماجد',
  'الخال نادر',
  'العم وليد',
  'الخالة منى',
  'العم جابر',
  'الخالة أمل',
];

const neighborhoods = [
  'حي المزروع',
  'حي النزهة',
  'حي السلام',
  'حي الورود',
  'حي اليرموك',
  'حي الخليج',
  'حي المروج',
  'حي النخيل',
  'حي الروضة',
  'حي الفيصلية',
];

const cities = [
  'الأحساء',
  'الرياض',
  'جدة',
  'الدمام',
  'المدينة المنورة',
  'الطائف',
  'أبها',
  'تبوك',
  'حائل',
  'جازان',
];

const nationalities = [
  'السعودية',
  'مصر',
  'الأردن',
  'اليمن',
  'سوريا',
  'السودان',
];

const statuses = [
  'مستمر في الدراسة',
  'مستمر في الدراسة',
  'مستمر في الدراسة',
  'منقول من مدرسة أخرى',
];

const pad = (value, width) => String(value).padStart(width, '0');

const formatHijriLikeDate = (year, month, day) => `${pad(day, 2)}/${pad(month, 2)}/${year}`;

const setCell = (sheet, address, value) => {
  sheet[address] = { t: 's', v: String(value ?? '') };
};

const parseSheetHeaderRow = (sheet) => {
  for (let row = 18; row <= 22; row += 1) {
    const header = sheet[`AC${row}`]?.v;
    if (String(header || '').trim() === 'اسم الطالب') {
      return row;
    }
  }

  throw new Error('Unable to locate template header row');
};

const workbook = XLSX.readFile(path.resolve(inputPath));
let sequence = 1;

workbook.SheetNames.forEach((sheetName, sheetIndex) => {
  const sheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const headerRow = parseSheetHeaderRow(sheet);
  const dataStartRow = headerRow + 1;
  const classLabel = String(sheet[`E${headerRow - 7}`]?.v || '').trim() || String(sheet[`E${headerRow - 6}`]?.v || '').trim();

  for (let row = dataStartRow; row <= range.e.r + 1; row += 1) {
    const localIndex = sequence - 1;
    const studentName = studentNames[localIndex % studentNames.length];
    const guardianName = guardianNames[localIndex % guardianNames.length];
    const relativeName = relativeNames[localIndex % relativeNames.length];
    const neighborhood = neighborhoods[localIndex % neighborhoods.length];
    const city = cities[localIndex % cities.length];
    const nationality = nationalities[localIndex % nationalities.length];
    const status = statuses[localIndex % statuses.length];
    const studentMobile = `05${pad(51000000 + sequence * 37, 8)}`;
    const homePhone = `013${pad(500000 + sequence * 13, 6)}`;
    const workPhone = `013${pad(700000 + sequence * 11, 6)}`;
    const iqamaNumber = `2${pad(100000000 + sequence * 41, 9)}`;
    const iqamaIssueDate = formatHijriLikeDate(1443 + (localIndex % 3), ((localIndex * 2) % 12) + 1, ((localIndex * 3) % 28) + 1);
    const birthDate = formatHijriLikeDate(1436 + (localIndex % 4), ((localIndex * 5) % 12) + 1, ((localIndex * 7) % 28) + 1);

    setCell(sheet, `C${row}`, studentMobile);
    setCell(sheet, `F${row}`, `${neighborhood} - ${city}`);
    setCell(sheet, `I${row}`, relativeName);
    setCell(sheet, `M${row}`, workPhone);
    setCell(sheet, `P${row}`, homePhone);
    setCell(sheet, `Q${row}`, guardianName);
    setCell(sheet, `S${row}`, String(sheet[`E${headerRow - 7}`]?.v || sheet[`E${headerRow - 6}`]?.v || classLabel || '1'));
    setCell(sheet, `T${row}`, iqamaIssueDate);
    setCell(sheet, `U${row}`, iqamaNumber);
    setCell(sheet, `X${row}`, nationality);
    setCell(sheet, `Y${row}`, birthDate);
    setCell(sheet, `Z${row}`, city);
    setCell(sheet, `AB${row}`, status);
    setCell(sheet, `AC${row}`, studentName);
    setCell(sheet, `AD${row}`, sequence);

    sequence += 1;
  }

  if (!sheet['!ref']) {
    return;
  }

  const nextRange = XLSX.utils.decode_range(sheet['!ref']);
  if (nextRange.e.r < range.e.r) {
    nextRange.e.r = range.e.r;
  }
  sheet['!ref'] = XLSX.utils.encode_range(nextRange);

  if (sheetIndex === 0) {
    setCell(sheet, 'AA1', 'المملكة العربية السعودية\nوزارة التعليم');
  }
});

XLSX.writeFile(workbook, path.resolve(outputPath));
console.log(path.resolve(outputPath));