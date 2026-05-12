require('dotenv').config();

const mongoose = require('mongoose');
const { getCurrentHijriAcademicYear } = require('../src/utils/academicYear');

const User = require('../src/models/User.model');
const School = require('../src/models/School.model');
const Subject = require('../src/models/Subject.model');
const Class = require('../src/models/Class.model');
const Teacher = require('../src/models/Teacher.model');
const Parent = require('../src/models/Parent.model');
const Student = require('../src/models/Student.model');
const Grade = require('../src/models/Grade.model');
const Attendance = require('../src/models/Attendance.model');
const Behavior = require('../src/models/Behavior.model');
const AuditLog = require('../src/models/AuditLog.model');
const Conversation = require('../src/models/Conversation.model');
const Message = require('../src/models/Message.model');
const Notification = require('../src/models/Notification.model');
const FileUpload = require('../src/models/FileUpload.model');
const attendanceService = require('../src/services/attendance.service');
const behaviorService = require('../src/services/behavior.service');
const messagingService = require('../src/services/messaging.service');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/basma';
const ACADEMIC_YEAR = getCurrentHijriAcademicYear();

const QA_SCHOOL = {
  name: 'مدرسة النخبة التجريبية',
  nameAr: 'مدرسة النخبة التجريبية',
  subdomain: 'qa-school',
  address: 'حي الندى، الرياض',
  phone: '0115557788',
  email: 'qa-school@basma.test',
  branding: {
    primaryColor: '#D4AF37',
    secondaryColor: '#0B1730',
    accentColor: '#F7E7A1',
  },
  settings: {
    workingDays: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
    timezone: 'Asia/Riyadh',
    locale: 'ar',
  },
};

const PASSWORDS = {
  admin: 'Admin@1234',
  teacher: 'Teacher@1234',
  parent: 'Parent@1234',
  student: 'Student@1234',
};

const SUBJECT_DEFS = [
  { code: 'MATH', name: 'Mathematics', nameAr: 'الرياضيات' },
  { code: 'ARAB', name: 'Arabic Language', nameAr: 'اللغة العربية' },
  { code: 'ENG', name: 'English Language', nameAr: 'اللغة الإنجليزية' },
  { code: 'SCI', name: 'Science', nameAr: 'العلوم' },
  { code: 'SOC', name: 'Social Studies', nameAr: 'الدراسات الاجتماعية' },
];

const CLASS_DEFS = [
  { key: 'grade4a', name: 'الرابع أ', grade: '4', section: 'A', capacity: 30 },
  { key: 'grade5a', name: 'الخامس أ', grade: '5', section: 'A', capacity: 30 },
  { key: 'grade6a', name: 'السادس أ', grade: '6', section: 'A', capacity: 30 },
];

const TEACHER_DEFS = [
  {
    key: 'math',
    name: { first: 'عمر', last: 'الحربي' },
    specialization: 'الرياضيات',
    subjectCodes: ['MATH'],
    classKeys: ['grade4a', 'grade5a', 'grade6a'],
    homeroomFor: 'grade4a',
  },
  {
    key: 'arabic',
    name: { first: 'مها', last: 'العتيبي' },
    specialization: 'اللغة العربية',
    subjectCodes: ['ARAB'],
    classKeys: ['grade4a', 'grade5a', 'grade6a'],
    homeroomFor: 'grade5a',
  },
  {
    key: 'english',
    name: { first: 'سارة', last: 'القحطاني' },
    specialization: 'اللغة الإنجليزية',
    subjectCodes: ['ENG'],
    classKeys: ['grade4a', 'grade5a', 'grade6a'],
    homeroomFor: 'grade6a',
  },
  {
    key: 'science',
    name: { first: 'فيصل', last: 'الشهري' },
    specialization: 'العلوم',
    subjectCodes: ['SCI'],
    classKeys: ['grade4a', 'grade5a', 'grade6a'],
  },
  {
    key: 'social',
    name: { first: 'نورة', last: 'الغامدي' },
    specialization: 'الدراسات الاجتماعية',
    subjectCodes: ['SOC'],
    classKeys: ['grade4a', 'grade5a', 'grade6a'],
  },
];

const HOUSEHOLDS = [
  { parentName: { first: 'خالد', last: 'العتيبي' }, occupation: 'مهندس', studentName: { first: 'ليث', last: 'العتيبي' }, gender: 'male', classKey: 'grade4a', dateOfBirth: '2015-01-12' },
  { parentName: { first: 'عبدالله', last: 'الحربي' }, occupation: 'محاسب', studentName: { first: 'سلمان', last: 'الحربي' }, gender: 'male', classKey: 'grade4a', dateOfBirth: '2015-02-21' },
  { parentName: { first: 'فهد', last: 'الغامدي' }, occupation: 'طبيب', studentName: { first: 'هتان', last: 'الغامدي' }, gender: 'male', classKey: 'grade4a', dateOfBirth: '2015-04-08' },
  { parentName: { first: 'تركي', last: 'الشمري' }, occupation: 'ضابط', studentName: { first: 'مشعل', last: 'الشمري' }, gender: 'male', classKey: 'grade4a', dateOfBirth: '2015-06-17' },
  { parentName: { first: 'سالم', last: 'المطيري' }, occupation: 'معلم', studentName: { first: 'راكان', last: 'المطيري' }, gender: 'male', classKey: 'grade4a', dateOfBirth: '2015-08-09' },
  { parentName: { first: 'ناصر', last: 'السبيعي' }, occupation: 'مطور نظم', studentName: { first: 'ريان', last: 'السبيعي' }, gender: 'male', classKey: 'grade4a', dateOfBirth: '2015-09-03' },
  { parentName: { first: 'محمد', last: 'الزهراني' }, occupation: 'رجل أعمال', studentName: { first: 'جود', last: 'الزهراني' }, gender: 'female', classKey: 'grade4a', dateOfBirth: '2015-11-14' },
  { parentName: { first: 'ماجد', last: 'القحطاني' }, occupation: 'مهندس مدني', studentName: { first: 'رغد', last: 'القحطاني' }, gender: 'female', classKey: 'grade5a', dateOfBirth: '2014-01-26' },
  { parentName: { first: 'طارق', last: 'الشهري' }, occupation: 'صيدلي', studentName: { first: 'لمى', last: 'الشهري' }, gender: 'female', classKey: 'grade5a', dateOfBirth: '2014-03-15' },
  { parentName: { first: 'زياد', last: 'الغفيلي' }, occupation: 'مهندس صناعي', studentName: { first: 'دانة', last: 'الغفيلي' }, gender: 'female', classKey: 'grade5a', dateOfBirth: '2014-05-09' },
  { parentName: { first: 'مروان', last: 'المالكي' }, occupation: 'محلل أعمال', studentName: { first: 'تالا', last: 'المالكي' }, gender: 'female', classKey: 'grade5a', dateOfBirth: '2014-07-18' },
  { parentName: { first: 'إبراهيم', last: 'السلمي' }, occupation: 'ممرض', studentName: { first: 'هيا', last: 'السلمي' }, gender: 'female', classKey: 'grade5a', dateOfBirth: '2014-08-23' },
  { parentName: { first: 'وليد', last: 'البقمي' }, occupation: 'مشرف عمليات', studentName: { first: 'رهف', last: 'البقمي' }, gender: 'female', classKey: 'grade5a', dateOfBirth: '2014-10-05' },
  { parentName: { first: 'ياسر', last: 'الحازمي' }, occupation: 'مدير مبيعات', studentName: { first: 'أريج', last: 'الحازمي' }, gender: 'female', classKey: 'grade6a', dateOfBirth: '2013-01-11' },
  { parentName: { first: 'سعود', last: 'الأنصاري' }, occupation: 'محامي', studentName: { first: 'أصيل', last: 'الأنصاري' }, gender: 'female', classKey: 'grade6a', dateOfBirth: '2013-02-19' },
  { parentName: { first: 'بندر', last: 'الدوسري' }, occupation: 'مهندس كهرباء', studentName: { first: 'لجين', last: 'الدوسري' }, gender: 'female', classKey: 'grade6a', dateOfBirth: '2013-04-27' },
  { parentName: { first: 'راشد', last: 'الجهني' }, occupation: 'مدرس جامعي', studentName: { first: 'مها', last: 'الجهني' }, gender: 'female', classKey: 'grade6a', dateOfBirth: '2013-06-03' },
  { parentName: { first: 'عبدالعزيز', last: 'العنزي' }, occupation: 'طيار', studentName: { first: 'بسمة', last: 'العنزي' }, gender: 'female', classKey: 'grade6a', dateOfBirth: '2013-08-12' },
  { parentName: { first: 'حسن', last: 'البلوي' }, occupation: 'أخصائي موارد بشرية', studentName: { first: 'نجلاء', last: 'البلوي' }, gender: 'female', classKey: 'grade6a', dateOfBirth: '2013-09-30' },
  { parentName: { first: 'معتز', last: 'العوفي' }, occupation: 'مدقق مالي', studentName: { first: 'شهد', last: 'العوفي' }, gender: 'female', classKey: 'grade6a', dateOfBirth: '2013-11-08' },
];

const HIGH_RISK_STUDENTS = new Set([1, 5, 9, 13, 17]);
const WATCH_STUDENTS = new Set([2, 6, 10, 14, 18]);
const TOP_STUDENTS = new Set([0, 4, 8, 12, 16]);

const GRADE_ASSESSMENTS = [
  { title: 'اختبار قصير للوحدة', assessmentType: 'quiz', maxScore: 20, daysAgo: 42, term: 'الفصل الثاني' },
  { title: 'واجب تطبيقي', assessmentType: 'assignment', maxScore: 10, daysAgo: 31, term: 'الفصل الثاني' },
  { title: 'اختبار منتصف الفصل', assessmentType: 'midterm', maxScore: 30, daysAgo: 18, term: 'الفصل الثاني' },
  { title: 'مشروع المادة', assessmentType: 'project', maxScore: 15, daysAgo: 12, term: 'الفصل الثاني' },
  { title: 'الاختبار النهائي', assessmentType: 'final', maxScore: 25, daysAgo: 6, term: 'الفصل الثاني' },
];

const ATTENDANCE_NOTES = {
  absence: ['غياب دون إشعار مسبق', 'موعد طبي', 'ظرف عائلي طارئ'],
  late: ['تأخر الحافلة المدرسية', 'ازدحام مروري', 'تأخر الصباح'],
  permission: ['استئذان رسمي من ولي الأمر', 'مراجعة طبية قصيرة', 'إجراء إداري'],
};

const pad = (value, size = 2) => String(value).padStart(size, '0');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const displayName = (user) => [user?.name?.first, user?.name?.last].filter(Boolean).join(' ').trim();

const createRng = (seed = 20260421) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const recentSchoolDays = (count) => {
  const days = [];
  let offset = 1;

  while (days.length < count) {
    const day = new Date();
    day.setDate(day.getDate() - offset);
    day.setHours(0, 0, 0, 0);
    offset += 1;

    const weekday = day.getDay();
    if (weekday !== 5 && weekday !== 6) {
      days.unshift(day);
    }
  }

  return days;
};

const pickFrom = (items, rng) => items[Math.floor(rng() * items.length)];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const dateDaysAgo = (daysAgo, hour = 9) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date;
};

const buildAttendanceState = (studentIndex, rng) => {
  const roll = rng();

  if (HIGH_RISK_STUDENTS.has(studentIndex)) {
    if (roll < 0.16) return 'absence';
    if (roll < 0.32) return 'late';
    if (roll < 0.40) return 'permission';
    return 'present';
  }

  if (WATCH_STUDENTS.has(studentIndex)) {
    if (roll < 0.08) return 'absence';
    if (roll < 0.20) return 'late';
    if (roll < 0.26) return 'permission';
    return 'present';
  }

  if (roll < 0.03) return 'absence';
  if (roll < 0.10) return 'late';
  if (roll < 0.13) return 'permission';
  return 'present';
};

const buildGradePercentage = (studentIndex, subjectCode, assessmentIndex, rng) => {
  let base = 79;

  if (TOP_STUDENTS.has(studentIndex)) base = 94;
  else if (HIGH_RISK_STUDENTS.has(studentIndex)) base = 56;
  else if (WATCH_STUDENTS.has(studentIndex)) base = 69;

  const subjectBias = {
    MATH: studentIndex % 3 === 0 ? 3 : -2,
    ARAB: studentIndex % 4 === 0 ? 2 : 0,
    ENG: studentIndex % 5 === 0 ? 4 : -1,
    SCI: studentIndex % 2 === 0 ? 1 : 0,
    SOC: 2,
  }[subjectCode] || 0;

  const assessmentBias = [1, -2, 0, 2, 3][assessmentIndex] || 0;
  const variance = Math.round((rng() - 0.5) * 10);

  return clamp(base + subjectBias + assessmentBias + variance, 38, 99);
};

const attachmentTypeForMime = (mimeType) => (mimeType.startsWith('image/') ? 'image' : 'document');

const createUploadStub = async ({ schoolId, uploadedBy, context, label, mimeType, size = 48000 }) => {
  const extension = mimeType === 'application/pdf'
    ? 'pdf'
    : mimeType.includes('sheet')
      ? 'xlsx'
      : mimeType.includes('png')
        ? 'png'
        : 'jpg';

  return FileUpload.create({
    schoolId,
    uploadedBy,
    fileName: `${label}.${extension}`,
    fileType: mimeType.includes('sheet') ? 'spreadsheet' : attachmentTypeForMime(mimeType),
    mimeType,
    size,
    url: `https://example.com/qa/${context}/${label}.${extension}`,
    publicId: `qa/${context}/${label}`,
    context,
    contextId: null,
    isOrphaned: true,
  });
};

const ensureConnection = async () => {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });
};

const clearQaSchool = async () => {
  const existingSchool = await School.findOne({ subdomain: QA_SCHOOL.subdomain }).select('_id');
  if (!existingSchool) return;

  const schoolId = existingSchool._id;

  await AuditLog.deleteMany({ schoolId });
  await FileUpload.deleteMany({ schoolId });
  await Notification.deleteMany({ schoolId });
  await Message.deleteMany({ schoolId });
  await Conversation.deleteMany({ schoolId });
  await Behavior.deleteMany({ schoolId });
  await Attendance.deleteMany({ schoolId });
  await Grade.deleteMany({ schoolId });
  await Student.deleteMany({ schoolId });
  await Parent.deleteMany({ schoolId });
  await Teacher.deleteMany({ schoolId });
  await Class.deleteMany({ schoolId });
  await Subject.deleteMany({ schoolId });
  await User.deleteMany({ schoolId });
  await School.deleteOne({ _id: schoolId });
};

const buildBehaviorPlans = (students) => {
  const plans = [];

  students.forEach((student, index) => {
    const name = displayName(student.user);

    if (TOP_STUDENTS.has(index)) {
      plans.push({
        student,
        type: 'positive',
        category: 'academic',
        description: `${name} قدّم مشروعاً بحثياً مميزاً وشرح الفكرة لزملائه بثقة عالية.`,
        attachmentMime: 'application/pdf',
      });
      plans.push({
        student,
        type: 'positive',
        category: 'leadership',
        description: `${name} بادر بتنظيم مجموعته داخل الفصل وساهم في ضبط وقت النشاط الجماعي.`,
      });
      return;
    }

    if (HIGH_RISK_STUDENTS.has(index)) {
      plans.push({
        student,
        type: 'negative',
        category: 'discipline',
        description: `${name} قاطع سير الحصة أكثر من مرة واحتاج إلى تنبيه مباشر من المعلم.`,
        attachmentMime: 'application/pdf',
      });
      plans.push({
        student,
        type: 'negative',
        category: 'homework',
        description: `${name} لم يسلّم الواجب المطلوب في الموعد المحدد للمرة الثانية هذا الأسبوع.`,
      });
      plans.push({
        student,
        type: 'positive',
        category: 'social',
        description: `${name} استجاب لخطة التحسين وتعاون مع زميله أثناء نشاط المتابعة الفردية.`,
      });
      return;
    }

    if (WATCH_STUDENTS.has(index)) {
      plans.push({
        student,
        type: 'negative',
        category: 'participation',
        description: `${name} احتاج إلى متابعة إضافية للمشاركة داخل الصف خلال هذا الأسبوع.`,
      });
      plans.push({
        student,
        type: 'positive',
        category: 'academic',
        description: `${name} حسّن أداءه في التقويم القصير مقارنة بالأسبوع السابق.`,
      });
      return;
    }

    plans.push({
      student,
      type: index % 2 === 0 ? 'positive' : 'negative',
      category: index % 2 === 0 ? 'social' : 'homework',
      description: index % 2 === 0
        ? `${name} تعاون مع زملائه في تنفيذ نشاط الفصل وأظهر سلوكاً إيجابياً ثابتاً.`
        : `${name} احتاج إلى تذكير إضافي لاستكمال متطلبات الحصة بشكل كامل.`,
      attachmentMime: index % 4 === 0 ? 'application/pdf' : null,
    });
  });

  return plans;
};

const seedQaDataset = async ({ reset = true, disconnect = true, silent = false } = {}) => {
  await ensureConnection();

  if (reset) {
    await clearQaSchool();
  }

  const school = await School.create({
    ...QA_SCHOOL,
    academicYear: ACADEMIC_YEAR,
  });

  const adminUser = await User.create({
    schoolId: school._id,
    role: 'school_admin',
    nationalId: '8200000001',
    phone: '0558200001',
    email: 'admin@qa.basma.test',
    password: PASSWORDS.admin,
    name: { first: 'أحمد', last: 'المدير' },
    mustChangePassword: false,
  });

  const subjectsByCode = {};
  for (const subjectDef of SUBJECT_DEFS) {
    const subject = await Subject.create({
      schoolId: school._id,
      name: subjectDef.name,
      nameAr: subjectDef.nameAr,
      code: subjectDef.code,
    });
    subjectsByCode[subjectDef.code] = subject;
  }

  const classesByKey = {};
  for (const classDef of CLASS_DEFS) {
    const classDoc = await Class.create({
      schoolId: school._id,
      name: classDef.name,
      grade: classDef.grade,
      section: classDef.section,
      academicYear: ACADEMIC_YEAR,
      capacity: classDef.capacity,
    });
    classesByKey[classDef.key] = classDoc;
  }

  const teachersByKey = {};
  for (let index = 0; index < TEACHER_DEFS.length; index += 1) {
    const teacherDef = TEACHER_DEFS[index];
    const user = await User.create({
      schoolId: school._id,
      role: 'teacher',
      nationalId: `8210000${pad(index + 1, 3)}`,
      phone: `0558210${pad(index + 1, 3)}`,
      email: `teacher${pad(index + 1)}@qa.basma.test`,
      password: PASSWORDS.teacher,
      name: teacherDef.name,
      mustChangePassword: false,
    });

    const profile = await Teacher.create({
      userId: user._id,
      schoolId: school._id,
      nationalId: user.nationalId,
      specialization: teacherDef.specialization,
      subjects: teacherDef.subjectCodes.map((code) => subjectsByCode[code]._id),
      classes: teacherDef.classKeys.map((key) => classesByKey[key]._id),
      joinDate: new Date('2024-08-25T08:00:00.000Z'),
    });

    teachersByKey[teacherDef.key] = { ...teacherDef, user, profile };

    if (teacherDef.homeroomFor) {
      await Class.findByIdAndUpdate(classesByKey[teacherDef.homeroomFor]._id, {
        $set: { teacherId: profile._id },
      });
    }
  }

  const students = [];
  const parents = [];
  const studentsByClassKey = {
    grade4a: [],
    grade5a: [],
    grade6a: [],
  };

  for (let index = 0; index < HOUSEHOLDS.length; index += 1) {
    const household = HOUSEHOLDS[index];
    const parentUser = await User.create({
      schoolId: school._id,
      role: 'parent',
      nationalId: `8220000${pad(index + 1, 3)}`,
      phone: `0558220${pad(index + 1, 3)}`,
      email: `parent${pad(index + 1)}@qa.basma.test`,
      password: PASSWORDS.parent,
      name: household.parentName,
      mustChangePassword: false,
    });

    const parentProfile = await Parent.create({
      userId: parentUser._id,
      schoolId: school._id,
      nationalId: parentUser.nationalId,
      occupation: household.occupation,
      address: 'الرياض',
      children: [],
    });

    const studentUser = await User.create({
      schoolId: school._id,
      role: 'student',
      nationalId: `8230000${pad(index + 1, 3)}`,
      phone: `0558230${pad(index + 1, 3)}`,
      email: `student${pad(index + 1)}@qa.basma.test`,
      password: PASSWORDS.student,
      name: household.studentName,
      mustChangePassword: false,
    });

    const studentProfile = await Student.create({
      userId: studentUser._id,
      schoolId: school._id,
      nationalId: studentUser.nationalId,
      classId: classesByKey[household.classKey]._id,
      parentId: parentProfile._id,
      gender: household.gender,
      dateOfBirth: new Date(`${household.dateOfBirth}T00:00:00.000Z`),
      healthStatus: index % 9 === 0 ? 'حساسية موسمية بسيطة' : null,
      specialStatus: index % 11 === 0 ? ['learning_difficulty'] : [],
      enrollmentDate: new Date('2024-08-25T08:00:00.000Z'),
      isActive: true,
    });

    await Parent.findByIdAndUpdate(parentProfile._id, {
      $addToSet: { children: studentProfile._id },
    });

    const studentRecord = {
      index,
      classKey: household.classKey,
      user: studentUser,
      profile: studentProfile,
      parentUser,
      parentProfile,
      classDoc: classesByKey[household.classKey],
    };

    parents.push({ index, user: parentUser, profile: parentProfile, childId: studentProfile._id, classKey: household.classKey });
    students.push(studentRecord);
    studentsByClassKey[household.classKey].push(studentRecord);
  }

  const homeroomTeachersByClass = {
    grade4a: teachersByKey.math,
    grade5a: teachersByKey.arabic,
    grade6a: teachersByKey.english,
  };
  const teachersBySubjectCode = Object.values(teachersByKey).reduce((acc, teacherEntry) => {
    teacherEntry.subjectCodes.forEach((subjectCode) => {
      acc[subjectCode] = teacherEntry;
    });
    return acc;
  }, {});

  const schoolDays = recentSchoolDays(10);
  const rng = createRng();

  let attendanceCreated = 0;
  for (const day of schoolDays) {
    for (const classDef of CLASS_DEFS) {
      const records = [];
      const classStudents = studentsByClassKey[classDef.key];

      classStudents.forEach((studentRecord) => {
        const type = buildAttendanceState(studentRecord.index, rng);
        if (type === 'present') return;

        records.push({
          studentId: studentRecord.profile._id,
          type,
          notes: pickFrom(ATTENDANCE_NOTES[type], rng),
        });
      });

      if (!records.length) continue;

      const created = await attendanceService.bulkCreateAttendance({
        classId: classesByKey[classDef.key]._id,
        date: day.toISOString(),
        records,
      }, school._id, {
        role: 'teacher',
        userId: homeroomTeachersByClass[classDef.key].user._id,
      });

      attendanceCreated += created.length;
    }
  }

  await delay(300);

  const behaviorPlans = buildBehaviorPlans(students);
  let behaviorCreated = 0;

  for (let index = 0; index < behaviorPlans.length; index += 1) {
    const plan = behaviorPlans[index];
    const teacher = homeroomTeachersByClass[plan.student.classKey];
    let attachments = [];

    if (plan.attachmentMime) {
      const upload = await createUploadStub({
        schoolId: school._id,
        uploadedBy: teacher.user._id,
        context: 'behavior',
        label: `behavior-${pad(index + 1, 3)}`,
        mimeType: plan.attachmentMime,
      });

      attachments = [{
        url: upload.url,
        type: attachmentTypeForMime(upload.mimeType),
        name: upload.fileName,
        size: upload.size,
        publicId: upload.publicId,
      }];
    }

    await behaviorService.createBehavior({
      studentId: plan.student.profile._id,
      classId: plan.student.classDoc._id,
      type: plan.type,
      category: plan.category,
      description: plan.description,
      attachments,
      notifyParent: true,
    }, school._id, {
      role: 'teacher',
      userId: teacher.user._id,
    });

    behaviorCreated += 1;
  }

  const gradeDocs = [];

  students.forEach((studentRecord) => {
    SUBJECT_DEFS.forEach((subjectDef) => {
      const subjectTeacher = teachersBySubjectCode[subjectDef.code];
      GRADE_ASSESSMENTS.forEach((assessment, assessmentIndex) => {
        const percentage = buildGradePercentage(studentRecord.index, subjectDef.code, assessmentIndex, rng);
        const rawScore = Math.round((percentage / 100) * assessment.maxScore);
        const score = clamp(rawScore, 0, assessment.maxScore);

        gradeDocs.push({
          schoolId: school._id,
          studentId: studentRecord.profile._id,
          subjectId: subjectsByCode[subjectDef.code]._id,
          classId: studentRecord.classDoc._id,
          teacherId: subjectTeacher.profile._id,
          title: `${assessment.title} - ${subjectDef.nameAr}`,
          assessmentType: assessment.assessmentType,
          score,
          maxScore: assessment.maxScore,
          examDate: dateDaysAgo(assessment.daysAgo, 9 + assessmentIndex),
          term: assessment.term,
          notes: percentage < 60
            ? 'يحتاج إلى متابعة أكاديمية وخطة تقوية في هذه المادة.'
            : percentage >= 90
              ? 'أداء متفوق وثبات جيد في استيعاب المادة.'
              : 'أداء جيد مع فرصة لرفع المستوى أكثر في التقييمات القادمة.',
          academicYear: ACADEMIC_YEAR,
          isPublished: true,
        });
      });
    });
  });

  if (gradeDocs.length) {
    await Grade.insertMany(gradeDocs, { ordered: true });
  }

  await delay(300);

  const conversationSeeds = [];
  const seededMessages = [];
  const conversationStudents = [
    studentsByClassKey.grade4a[0],
    studentsByClassKey.grade4a[1],
    studentsByClassKey.grade5a[0],
    studentsByClassKey.grade5a[1],
    studentsByClassKey.grade6a[0],
    studentsByClassKey.grade6a[1],
  ].filter(Boolean);

  for (let index = 0; index < conversationStudents.length; index += 1) {
    const studentRecord = conversationStudents[index];
    const teacher = homeroomTeachersByClass[studentRecord.classKey];
    const parentUser = studentRecord.parentUser;

    const conversation = await messagingService.getOrCreateConversation(
      teacher.user._id,
      parentUser._id,
      school._id,
      { role: 'teacher', userId: teacher.user._id },
    );

    conversationSeeds.push(conversation);

    const messageDrafts = [
      {
        senderRole: 'teacher',
        senderId: teacher.user._id,
        recipientId: parentUser._id,
        text: `مرحباً، هذه متابعة سريعة بشأن أداء ${displayName(studentRecord.user)} خلال هذا الأسبوع.`,
      },
      {
        senderRole: 'parent',
        senderId: parentUser._id,
        recipientId: teacher.user._id,
        text: 'شكراً على التحديث. هل هناك نقاط محددة تنصحون بالتركيز عليها في المنزل؟',
      },
      {
        senderRole: 'teacher',
        senderId: teacher.user._id,
        recipientId: parentUser._id,
        text: 'أرفقت لكم ملخصاً مختصراً للواجبات والمتابعة المطلوبة هذا الأسبوع.',
        attachmentMime: 'application/pdf',
      },
      {
        senderRole: 'parent',
        senderId: parentUser._id,
        recipientId: teacher.user._id,
        text: 'تم الاطلاع على المرفق، وسنراجع الخطة المسائية اليوم.',
      },
    ];

    for (let draftIndex = 0; draftIndex < messageDrafts.length; draftIndex += 1) {
      const draft = messageDrafts[draftIndex];
      let attachments = [];

      if (draft.attachmentMime) {
        const upload = await createUploadStub({
          schoolId: school._id,
          uploadedBy: draft.senderId,
          context: 'message',
          label: `message-${pad(index + 1)}-${pad(draftIndex + 1)}`,
          mimeType: draft.attachmentMime,
          size: 64000,
        });

        attachments = [{
          url: upload.url,
          type: attachmentTypeForMime(upload.mimeType),
          name: upload.fileName,
          size: upload.size,
          publicId: upload.publicId,
        }];
      }

      const message = await messagingService.sendMessage(conversation._id, draft.senderId, {
        text: draft.text,
        attachments,
      }, school._id, {
        role: draft.senderRole,
        userId: draft.senderId,
      });

      seededMessages.push(message);
    }
  }

  await createUploadStub({
    schoolId: school._id,
    uploadedBy: adminUser._id,
    context: 'import',
    label: 'students-batch-01',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 82000,
  });

  const counts = {
    schools: 1,
    admins: 1,
    teachers: TEACHER_DEFS.length,
    students: students.length,
    parents: parents.length,
    classes: CLASS_DEFS.length,
    subjects: SUBJECT_DEFS.length,
    grades: gradeDocs.length,
    attendance: attendanceCreated,
    behavior: behaviorCreated,
    conversations: conversationSeeds.length,
    messages: seededMessages.length,
    notifications: await Notification.countDocuments({ schoolId: school._id }),
    uploads: await FileUpload.countDocuments({ schoolId: school._id }),
  };

  const sampleStudent = studentsByClassKey.grade4a[0];
  const sampleTeacher = homeroomTeachersByClass[sampleStudent.classKey];
  const controlParent = parents.find((parent) => parent.classKey !== sampleStudent.classKey) || parents[1];
  const sampleConversation = conversationSeeds.find((conversation) => conversation.participants
    .map((participant) => String(participant._id || participant))
    .includes(String(sampleStudent.parentUser._id)));

  const result = {
    school: {
      id: String(school._id),
      name: school.name,
      subdomain: school.subdomain,
    },
    credentials: {
      admin: { nationalId: '8200000001', password: PASSWORDS.admin },
      teachers: Object.values(teachersByKey).map((teacher) => ({
        id: String(teacher.profile._id),
        userId: String(teacher.user._id),
        nationalId: teacher.user.nationalId,
        password: PASSWORDS.teacher,
        classKeys: teacher.classKeys,
        name: displayName(teacher.user),
      })),
      parents: parents.map((parent) => ({
        id: String(parent.profile._id),
        userId: String(parent.user._id),
        nationalId: parent.user.nationalId,
        password: PASSWORDS.parent,
        childId: String(parent.childId),
      })),
      students: students.map((student) => ({
        id: String(student.profile._id),
        userId: String(student.user._id),
        nationalId: student.user.nationalId,
        password: PASSWORDS.student,
        classKey: student.classKey,
      })),
    },
    entities: {
      classes: CLASS_DEFS.map((classDef) => ({
        id: String(classesByKey[classDef.key]._id),
        key: classDef.key,
        name: classDef.name,
      })),
      subjects: SUBJECT_DEFS.map((subjectDef) => ({
        id: String(subjectsByCode[subjectDef.code]._id),
        code: subjectDef.code,
        name: subjectDef.nameAr,
      })),
      students: students.map((student) => ({
        id: String(student.profile._id),
        userId: String(student.user._id),
        parentId: String(student.parentProfile._id),
        parentUserId: String(student.parentUser._id),
        classId: String(student.classDoc._id),
        classKey: student.classKey,
        nationalId: student.user.nationalId,
        name: displayName(student.user),
      })),
      parents: parents.map((parent) => ({
        id: String(parent.profile._id),
        userId: String(parent.user._id),
        childId: String(parent.childId),
        nationalId: parent.user.nationalId,
        classKey: parent.classKey,
      })),
      teachers: Object.values(teachersByKey).map((teacher) => ({
        id: String(teacher.profile._id),
        userId: String(teacher.user._id),
        nationalId: teacher.user.nationalId,
        classKeys: teacher.classKeys,
        homeroomFor: teacher.homeroomFor || null,
        name: displayName(teacher.user),
      })),
    },
    sample: {
      teacher: {
        id: String(sampleTeacher.profile._id),
        userId: String(sampleTeacher.user._id),
        nationalId: sampleTeacher.user.nationalId,
        password: PASSWORDS.teacher,
        classId: String(sampleStudent.classDoc._id),
        classKey: sampleStudent.classKey,
        studentId: String(sampleStudent.profile._id),
        studentName: displayName(sampleStudent.user),
      },
      parent: {
        id: String(sampleStudent.parentProfile._id),
        userId: String(sampleStudent.parentUser._id),
        nationalId: sampleStudent.parentUser.nationalId,
        password: PASSWORDS.parent,
        childId: String(sampleStudent.profile._id),
        childName: displayName(sampleStudent.user),
      },
      controlParent: {
        id: String(controlParent.profile._id),
        userId: String(controlParent.user._id),
        nationalId: controlParent.user.nationalId,
        password: PASSWORDS.parent,
        childId: String(controlParent.childId),
      },
      student: {
        id: String(sampleStudent.profile._id),
        userId: String(sampleStudent.user._id),
        nationalId: sampleStudent.user.nationalId,
        password: PASSWORDS.student,
      },
      conversationId: sampleConversation ? String(sampleConversation._id) : null,
    },
    dateRange: {
      startDate: schoolDays[0].toISOString(),
      endDate: schoolDays[schoolDays.length - 1].toISOString(),
      schoolDays: schoolDays.map((day) => day.toISOString()),
    },
    counts,
  };

  if (!silent) {
    console.log('QA seed completed successfully.');
    console.log(JSON.stringify({
      school: result.school,
      counts: result.counts,
      sample: result.sample,
      dateRange: result.dateRange,
    }, null, 2));
  }

  if (disconnect) {
    await mongoose.disconnect();
  }

  return result;
};

if (require.main === module) {
  seedQaDataset().catch(async (error) => {
    console.error('QA seed failed:', error.message);
    console.error(error.stack);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  });
}

module.exports = {
  seedQaDataset,
  QA_SCHOOL,
  PASSWORDS,
  ACADEMIC_YEAR,
};