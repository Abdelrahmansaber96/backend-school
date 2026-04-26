/**
 * seed-full.js — بيانات تجريبية شاملة لجميع أقسام المنصة
 * Run: node scripts/seed-full.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/basma';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;
const ACADEMIC_YEAR = '2025-2026';

// ─── Load models ─────────────────────────────────────────────────────────────
const User       = require('../src/models/User.model');
const School     = require('../src/models/School.model');
const Subject    = require('../src/models/Subject.model');
const Class      = require('../src/models/Class.model');
const Teacher    = require('../src/models/Teacher.model');
const Parent     = require('../src/models/Parent.model');
const Student    = require('../src/models/Student.model');
const Attendance = require('../src/models/Attendance.model');
const Behavior   = require('../src/models/Behavior.model');

// ─── Helper: hash password ────────────────────────────────────────────────────
const hash = (pw) => bcrypt.hash(pw, BCRYPT_ROUNDS);

// ─── Helper: pick random element ─────────────────────────────────────────────
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ─── Helper: date N days ago ──────────────────────────────────────────────────
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
};

// ─── Helper: get last N school days (skip Fri/Sat) ───────────────────────────
const schoolDays = (count) => {
  const days = [];
  let offset = 1;
  while (days.length < count) {
    const d = daysAgo(offset++);
    const dow = d.getDay(); // 0=Sun … 6=Sat
    if (dow !== 5 && dow !== 6) days.push(new Date(d));
  }
  return days;
};

// ─── Main seed ────────────────────────────────────────────────────────────────
async function seed() {
  console.log('\n🔌 Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected.\n');

  // ── 1. Super Admin ──────────────────────────────────────────────────────────
  console.log('👤 [1/9] Super Admin…');
  let superAdmin = await User.findOne({ nationalId: '1000000001' });
  if (!superAdmin) {
    superAdmin = await User.create({
      name: { first: 'سوبر', last: 'أدمن' },
      nationalId: '1000000001',
      phone: '0500000001',
      email: 'admin@basma.edu',
      password: await hash('Admin@1234'),
      role: 'super_admin',
    });
    console.log('  ✅ تم إنشاء super_admin (1000000001 / Admin@1234)');
  } else {
    console.log('  ⚠  super_admin موجود — تم التخطي');
  }

  // ── 2. School ───────────────────────────────────────────────────────────────
  console.log('\n🏫 [2/9] المدرسة…');
  let school = await School.findOne({ name: 'مدرسة النور' });
  if (!school) {
    school = await School.create({
      name: 'مدرسة النور',
      nameAr: 'مدرسة النور الابتدائية',
      subdomain: 'alnoor',
      address: 'حي النزهة، الرياض',
      phone: '0112345678',
      email: 'alnoor@schools.edu.sa',
      academicYear: ACADEMIC_YEAR,
      branding: {
        primaryColor: '#C8A24D',
        secondaryColor: '#0a0e1a',
      },
      settings: {
        workingDays: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
        timezone: 'Asia/Riyadh',
        locale: 'ar',
      },
    });
    console.log('  ✅ تم إنشاء المدرسة: مدرسة النور');
  } else {
    console.log('  ⚠  المدرسة موجودة — تم التخطي');
  }

  const schoolId = school._id;

  // ── 3. School Admin ─────────────────────────────────────────────────────────
  console.log('\n👨‍💼 [3/9] مدير المدرسة…');
  let schoolAdminUser = await User.findOne({ nationalId: '2000000001' });
  if (!schoolAdminUser) {
    schoolAdminUser = await User.create({
      name: { first: 'أحمد', last: 'المدير' },
      nationalId: '2000000001',
      phone: '0500000002',
      email: 'principal@alnoor.edu.sa',
      password: await hash('School@1234'),
      role: 'school_admin',
      schoolId,
    });
    console.log('  ✅ مدير المدرسة: أحمد المدير (2000000001 / School@1234)');
  } else {
    console.log('  ⚠  مدير المدرسة موجود — تم التخطي');
  }

  // ── 4. Subjects ─────────────────────────────────────────────────────────────
  console.log('\n📚 [4/9] المواد الدراسية…');
  const subjectDefs = [
    { name: 'الرياضيات',         nameAr: 'الرياضيات',         code: 'MATH' },
    { name: 'اللغة العربية',     nameAr: 'اللغة العربية',     code: 'AR'   },
    { name: 'اللغة الإنجليزية', nameAr: 'اللغة الإنجليزية', code: 'EN'   },
    { name: 'العلوم',            nameAr: 'العلوم',            code: 'SCI'  },
    { name: 'الدراسات الاجتماعية', nameAr: 'الدراسات الاجتماعية', code: 'SOC' },
    { name: 'التربية الإسلامية', nameAr: 'التربية الإسلامية', code: 'ISLM' },
    { name: 'التربية الفنية',    nameAr: 'التربية الفنية',    code: 'ART'  },
    { name: 'التربية البدنية',   nameAr: 'التربية البدنية',   code: 'PE'   },
  ];

  const subjects = {};
  for (const def of subjectDefs) {
    let sub = await Subject.findOne({ schoolId, code: def.code });
    if (!sub) {
      sub = await Subject.create({ ...def, schoolId });
      console.log(`  ✅ مادة: ${def.nameAr}`);
    } else {
      console.log(`  ⚠  ${def.nameAr} موجودة — تم التخطي`);
    }
    subjects[def.code] = sub;
  }

  // ── 5. Classes ──────────────────────────────────────────────────────────────
  console.log('\n🏛️  [5/9] الفصول الدراسية…');
  const classDefs = [
    { name: 'الأول أ',  grade: '1', section: 'أ', capacity: 30 },
    { name: 'الأول ب',  grade: '1', section: 'ب', capacity: 30 },
    { name: 'الثاني أ', grade: '2', section: 'أ', capacity: 30 },
    { name: 'الثالث أ', grade: '3', section: 'أ', capacity: 30 },
    { name: 'الرابع أ', grade: '4', section: 'أ', capacity: 30 },
    { name: 'الخامس أ', grade: '5', section: 'أ', capacity: 30 },
  ];

  const classes = {};
  for (const def of classDefs) {
    let cls = await Class.findOne({ schoolId, name: def.name, academicYear: ACADEMIC_YEAR });
    if (!cls) {
      cls = await Class.create({ ...def, schoolId, academicYear: ACADEMIC_YEAR });
      console.log(`  ✅ فصل: ${def.name}`);
    } else {
      console.log(`  ⚠  فصل ${def.name} موجود — تم التخطي`);
    }
    classes[def.name] = cls;
  }

  // ── 6. Teachers ─────────────────────────────────────────────────────────────
  console.log('\n👩‍🏫 [6/9] المعلمون…');
  const teacherDefs = [
    {
      first: 'عمر',      last: 'الأحمدي',  nationalId: '3000000001', phone: '0500000010',
      specialization: 'الرياضيات والعلوم',
      subjectCodes: ['MATH', 'SCI'],
      classNames: ['الأول أ', 'الثاني أ'],
    },
    {
      first: 'سارة',     last: 'العتيبي',  nationalId: '3000000002', phone: '0500000011',
      specialization: 'اللغة العربية',
      subjectCodes: ['AR', 'ISLM'],
      classNames: ['الأول ب', 'الثالث أ'],
    },
    {
      first: 'خالد',     last: 'السبيعي',  nationalId: '3000000003', phone: '0500000012',
      specialization: 'اللغة الإنجليزية',
      subjectCodes: ['EN'],
      classNames: ['الرابع أ', 'الخامس أ'],
    },
    {
      first: 'نورة',     last: 'الحارثي',  nationalId: '3000000004', phone: '0500000013',
      specialization: 'الدراسات الاجتماعية',
      subjectCodes: ['SOC', 'ART'],
      classNames: ['الأول أ', 'الثالث أ'],
    },
    {
      first: 'محمد',     last: 'الغامدي',  nationalId: '3000000005', phone: '0500000014',
      specialization: 'التربية البدنية',
      subjectCodes: ['PE'],
      classNames: ['الأول أ', 'الأول ب', 'الثاني أ'],
    },
  ];

  const teachers = {};
  for (const def of teacherDefs) {
    let tUser = await User.findOne({ nationalId: def.nationalId });
    if (!tUser) {
      tUser = await User.create({
        name: { first: def.first, last: def.last },
        nationalId: def.nationalId,
        phone: def.phone,
        password: await hash('Teacher@1234'),
        role: 'teacher',
        schoolId,
      });
    }
    let tProfile = await Teacher.findOne({ schoolId, nationalId: def.nationalId });
    if (!tProfile) {
      tProfile = await Teacher.create({
        userId: tUser._id,
        schoolId,
        nationalId: def.nationalId,
        specialization: def.specialization,
        subjects: def.subjectCodes.map((c) => subjects[c]._id),
        classes: def.classNames.map((n) => classes[n]._id),
        joinDate: new Date('2024-09-01'),
      });
      console.log(`  ✅ معلم: ${def.first} ${def.last}`);
    } else {
      console.log(`  ⚠  معلم ${def.first} موجود — تم التخطي`);
    }
    teachers[def.nationalId] = { user: tUser, profile: tProfile };
  }

  // Assign head teachers to classes
  await Class.findByIdAndUpdate(classes['الأول أ']._id,  { teacherId: teachers['3000000001'].profile._id });
  await Class.findByIdAndUpdate(classes['الأول ب']._id,  { teacherId: teachers['3000000002'].profile._id });
  await Class.findByIdAndUpdate(classes['الثاني أ']._id, { teacherId: teachers['3000000001'].profile._id });
  await Class.findByIdAndUpdate(classes['الثالث أ']._id, { teacherId: teachers['3000000002'].profile._id });
  await Class.findByIdAndUpdate(classes['الرابع أ']._id, { teacherId: teachers['3000000003'].profile._id });
  await Class.findByIdAndUpdate(classes['الخامس أ']._id, { teacherId: teachers['3000000003'].profile._id });

  // ── 7. Parents ──────────────────────────────────────────────────────────────
  console.log('\n👨‍👩‍👧 [7/9] أولياء الأمور…');
  const parentDefs = [
    { first: 'فهد',    last: 'الزهراني',  nationalId: '4000000001', phone: '0500000020', occupation: 'مهندس'    },
    { first: 'سلطان',  last: 'المطيري',   nationalId: '4000000002', phone: '0500000021', occupation: 'معلم'     },
    { first: 'راشد',   last: 'البلوي',    nationalId: '4000000003', phone: '0500000022', occupation: 'طبيب'     },
    { first: 'ناصر',   last: 'القحطاني',  nationalId: '4000000004', phone: '0500000023', occupation: 'محاسب'    },
    { first: 'عبدالله',last: 'الشهري',    nationalId: '4000000005', phone: '0500000024', occupation: 'موظف حكومي' },
    { first: 'طارق',   last: 'العنزي',    nationalId: '4000000006', phone: '0500000025', occupation: 'رجل أعمال' },
  ];

  const parents = {};
  for (const def of parentDefs) {
    let pUser = await User.findOne({ nationalId: def.nationalId });
    if (!pUser) {
      pUser = await User.create({
        name: { first: def.first, last: def.last },
        nationalId: def.nationalId,
        phone: def.phone,
        password: await hash('Parent@1234'),
        role: 'parent',
        schoolId,
      });
    }
    let pProfile = await Parent.findOne({ schoolId, nationalId: def.nationalId });
    if (!pProfile) {
      pProfile = await Parent.create({
        userId: pUser._id,
        schoolId,
        nationalId: def.nationalId,
        occupation: def.occupation,
        address: 'الرياض',
      });
      console.log(`  ✅ ولي أمر: ${def.first} ${def.last}`);
    } else {
      console.log(`  ⚠  ولي أمر ${def.first} موجود — تم التخطي`);
    }
    parents[def.nationalId] = { user: pUser, profile: pProfile };
  }

  // ── 8. Students ─────────────────────────────────────────────────────────────
  console.log('\n🎒 [8/9] الطلاب…');
  const studentDefs = [
    // الأول أ — معلم: عمر الأحمدي
    { first: 'يوسف',    last: 'الزهراني',  nationalId: '5000000001', phone: '0500000030', gender: 'male',   classKey: 'الأول أ',  parentKey: '4000000001', dob: '2018-03-10' },
    { first: 'ريم',     last: 'الزهراني',  nationalId: '5000000002', phone: '0500000031', gender: 'female', classKey: 'الأول أ',  parentKey: '4000000001', dob: '2019-07-22' },
    { first: 'عبدالعزيز',last:'المطيري',   nationalId: '5000000003', phone: '0500000032', gender: 'male',   classKey: 'الأول أ',  parentKey: '4000000002', dob: '2018-11-05' },
    // الأول ب
    { first: 'لانا',    last: 'المطيري',   nationalId: '5000000004', phone: '0500000033', gender: 'female', classKey: 'الأول ب',  parentKey: '4000000002', dob: '2019-02-14' },
    { first: 'بدر',     last: 'البلوي',    nationalId: '5000000005', phone: '0500000034', gender: 'male',   classKey: 'الأول ب',  parentKey: '4000000003', dob: '2018-09-30' },
    // الثاني أ
    { first: 'غدير',    last: 'البلوي',    nationalId: '5000000006', phone: '0500000035', gender: 'female', classKey: 'الثاني أ', parentKey: '4000000003', dob: '2017-05-18' },
    { first: 'تركي',    last: 'القحطاني',  nationalId: '5000000007', phone: '0500000036', gender: 'male',   classKey: 'الثاني أ', parentKey: '4000000004', dob: '2017-12-03' },
    { first: 'ديما',    last: 'القحطاني',  nationalId: '5000000008', phone: '0500000037', gender: 'female', classKey: 'الثاني أ', parentKey: '4000000004', dob: '2018-01-25' },
    // الثالث أ
    { first: 'سلطان',   last: 'الشهري',    nationalId: '5000000009', phone: '0500000038', gender: 'male',   classKey: 'الثالث أ', parentKey: '4000000005', dob: '2016-08-12' },
    { first: 'هيلة',    last: 'الشهري',    nationalId: '5000000010', phone: '0500000039', gender: 'female', classKey: 'الثالث أ', parentKey: '4000000005', dob: '2016-04-07' },
    // الرابع أ
    { first: 'منصور',   last: 'العنزي',    nationalId: '5000000011', phone: '0500000040', gender: 'male',   classKey: 'الرابع أ', parentKey: '4000000006', dob: '2015-06-20' },
    { first: 'جواهر',   last: 'العنزي',    nationalId: '5000000012', phone: '0500000041', gender: 'female', classKey: 'الرابع أ', parentKey: '4000000006', dob: '2015-10-15' },
    { first: 'خالد',    last: 'الزهراني',  nationalId: '5000000013', phone: '0500000042', gender: 'male',   classKey: 'الرابع أ', parentKey: '4000000001', dob: '2015-02-28' },
    // الخامس أ
    { first: 'ريان',    last: 'المطيري',   nationalId: '5000000014', phone: '0500000043', gender: 'male',   classKey: 'الخامس أ', parentKey: '4000000002', dob: '2014-07-11' },
    { first: 'نوف',     last: 'البلوي',    nationalId: '5000000015', phone: '0500000044', gender: 'female', classKey: 'الخامس أ', parentKey: '4000000003', dob: '2014-11-30' },
  ];

  const students = [];
  for (const def of studentDefs) {
    let sUser = await User.findOne({ nationalId: def.nationalId });
    if (!sUser) {
      sUser = await User.create({
        name: { first: def.first, last: def.last },
        nationalId: def.nationalId,
        phone: def.phone,
        password: await hash('Student@1234'),
        role: 'student',
        schoolId,
      });
    }
    let sProfile = await Student.findOne({ schoolId, nationalId: def.nationalId });
    if (!sProfile) {
      const parentProfile = parents[def.parentKey].profile;
      const classDoc      = classes[def.classKey];
      sProfile = await Student.create({
        userId: sUser._id,
        schoolId,
        nationalId: def.nationalId,
        classId: classDoc._id,
        parentId: parentProfile._id,
        gender: def.gender,
        dateOfBirth: new Date(def.dob),
        isActive: true,
      });
      // add student to parent's children list
      await Parent.findByIdAndUpdate(parentProfile._id, { $addToSet: { children: sProfile._id } });
      console.log(`  ✅ طالب: ${def.first} ${def.last} → ${def.classKey}`);
    } else {
      console.log(`  ⚠  طالب ${def.first} موجود — تم التخطي`);
    }
    students.push({ user: sUser, profile: sProfile, classKey: def.classKey });
  }

  // ── 9. Attendance records ───────────────────────────────────────────────────
  console.log('\n📅 [9a/9] سجلات الحضور…');
  const last14Days = schoolDays(14);
  const attendanceTypes = ['absence', 'late', 'permission'];
  const attendanceNotes = {
    absence:    ['لم يحضر دون إشعار', 'مرض', 'ظروف خاصة'],
    late:       ['تأخر 15 دقيقة', 'تأخر 30 دقيقة', 'ازدحام مروري'],
    permission: ['إذن رسمي من ولي الأمر', 'موعد طبي', 'حادث عائلي'],
  };

  let attCreated = 0;
  for (const stu of students) {
    const classDoc = classes[stu.classKey];
    // Find teacher for this class
    const teacherProfile = Object.values(teachers).find((t) =>
      t.profile.classes.some((cId) => cId.toString() === classDoc._id.toString()),
    )?.profile;
    if (!teacherProfile) continue;

    // Each student gets ~4 records in last 14 days (not every day)
    const daysToRecord = last14Days.filter((_, i) => i % 3 === 0 || i % 4 === 0).slice(0, 5);
    for (const day of daysToRecord) {
      const exists = await Attendance.findOne({ schoolId, studentId: stu.profile._id, date: day });
      if (exists) continue;
      const type = pick(attendanceTypes);
      try {
        await Attendance.create({
          schoolId,
          studentId: stu.profile._id,
          classId:   classDoc._id,
          teacherId: teacherProfile._id,
          date:      day,
          type,
          notes:     pick(attendanceNotes[type]),
          academicYear: ACADEMIC_YEAR,
        });
        attCreated++;
      } catch (_) { /* skip duplicate */ }
    }
  }
  console.log(`  ✅ تم إنشاء ${attCreated} سجل حضور`);

  // ── Behavior records ────────────────────────────────────────────────────────
  console.log('\n🧑‍⚖️  [9b/9] سجلات السلوك…');
  const behaviorRecords = [
    { studentIdx: 0,  type: 'positive', category: 'academic',    description: 'أبدى الطالب يوسف تفوقاً واضحاً في حل مسائل الرياضيات وتميّز بين أقرانه خلال الحصة.' },
    { studentIdx: 2,  type: 'positive', category: 'social',      description: 'تعاون عبدالعزيز مع زملائه في مشروع العلوم الجماعي وأظهر روح الفريق العالية.' },
    { studentIdx: 4,  type: 'negative', category: 'discipline',  description: 'تغيّب بدر عن حصتين دون إذن مسبق وتم إخطار ولي الأمر بذلك.' },
    { studentIdx: 6,  type: 'positive', category: 'academic',    description: 'حصل تركي على أعلى درجة في اختبار اللغة الإنجليزية لهذا الشهر.' },
    { studentIdx: 7,  type: 'negative', category: 'discipline',  description: 'قاطعت ديما المعلم أثناء الشرح بشكل متكرر رغم التنبيه المسبق.' },
    { studentIdx: 1,  type: 'positive', category: 'social',      description: 'أسهمت ريم في تنظيم حفل المدرسة وأبدت قيادة ممتازة في تنسيق زميلاتها.' },
    { studentIdx: 8,  type: 'negative', category: 'other',       description: 'نسي سلطان واجباته المنزلية للمرة الثالثة هذا الأسبوع بعد تنبيهات متكررة.' },
    { studentIdx: 10, type: 'positive', category: 'academic',    description: 'قدّم منصور بحثاً متميزاً عن تاريخ المملكة العربية السعودية خلال درس الدراسات الاجتماعية.' },
    { studentIdx: 3,  type: 'positive', category: 'social',      description: 'ساعدت لانا زميلتها في فهم مادة الرياضيات بطريقة تطوعية ومثّلت نموذجاً يُحتذى به.' },
    { studentIdx: 9,  type: 'negative', category: 'discipline',  description: 'تشاجرت هيلة مع زميلة لها في الفصل وأُرسلت إلى الإدارة لمعالجة الموقف.' },
    { studentIdx: 11, type: 'positive', category: 'academic',    description: 'برعت جواهر في مادة الفنية وفازت بجائزة أفضل لوحة فنية في معرض المدرسة السنوي.' },
    { studentIdx: 12, type: 'negative', category: 'other',       description: 'لوحظ على خالد استخدام الجوال في الفصل رغم التحذير المسبق من الإدارة.' },
    { studentIdx: 13, type: 'positive', category: 'social',      description: 'أظهر ريان مبادرة رائعة في تنظيف الفصل دون أن يُطلب منه ذلك.' },
    { studentIdx: 14, type: 'positive', category: 'academic',    description: 'حفظت نوف سورة جديدة كاملة وأتقنت تلاوتها في حصة التربية الإسلامية.' },
    { studentIdx: 5,  type: 'negative', category: 'discipline',  description: 'تأخرت غدير عن موعد تسليم الواجبات ثلاث مرات متتالية هذا الأسبوع.' },
  ];

  let behCreated = 0;
  for (const rec of behaviorRecords) {
    const stu = students[rec.studentIdx];
    if (!stu) continue;
    const classDoc = classes[stu.classKey];
    const teacherProfile = Object.values(teachers).find((t) =>
      t.profile.classes.some((cId) => cId.toString() === classDoc._id.toString()),
    )?.profile;
    if (!teacherProfile) continue;

    // Check if a similar record already exists
    const exists = await Behavior.findOne({
      schoolId,
      studentId: stu.profile._id,
      description: rec.description,
    });
    if (exists) { console.log(`  ⚠  سجل سلوك موجود — تم التخطي`); continue; }

    await Behavior.create({
      schoolId,
      studentId:   stu.profile._id,
      teacherId:   teacherProfile._id,
      classId:     classDoc._id,
      type:        rec.type,
      category:    rec.category,
      description: rec.description,
      notifyParent: true,
      academicYear: ACADEMIC_YEAR,
    });
    behCreated++;
  }
  console.log(`  ✅ تم إنشاء ${behCreated} سجل سلوك`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ اكتمل الـ Seeding بنجاح!\n');
  console.log('📋 ملخص البيانات المُنشأة:');
  console.log(`   🏫 مدرسة         : 1`);
  console.log(`   👤 مدير المدرسة  : 1   (2000000001 / School@1234)`);
  console.log(`   📚 مواد دراسية  : ${Object.keys(subjects).length}`);
  console.log(`   🏛️  فصول دراسية  : ${Object.keys(classes).length}`);
  console.log(`   👩‍🏫 معلمون        : ${teacherDefs.length}  (كلمة المرور: Teacher@1234)`);
  console.log(`   👨‍👩‍👧 أولياء أمور   : ${parentDefs.length}  (كلمة المرور: Parent@1234)`);
  console.log(`   🎒 طلاب          : ${studentDefs.length} (كلمة المرور: Student@1234)`);
  console.log(`   📅 سجلات حضور   : ${attCreated}`);
  console.log(`   🧑‍⚖️  سجلات سلوك   : ${behCreated}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('\n❌ فشل الـ Seeding:', err.message);
  console.error(err.stack);
  process.exit(1);
});
