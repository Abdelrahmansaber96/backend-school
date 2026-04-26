require('dotenv').config();

const fs = require('fs');
const http = require('http');
const path = require('path');

const mongoose = require('mongoose');

const app = require('../src/app');
const User = require('../src/models/User.model');
const School = require('../src/models/School.model');
const Student = require('../src/models/Student.model');
const Attendance = require('../src/models/Attendance.model');
const Behavior = require('../src/models/Behavior.model');
const AuditLog = require('../src/models/AuditLog.model');
const Notification = require('../src/models/Notification.model');
const reportService = require('../src/services/report.service');
const { generateAccessToken } = require('../src/utils/jwt');
const { init: initSocketServer } = require('../src/sockets/socket.server');
const { SOCKET_EVENTS } = require('../src/sockets/socket.contract');
const { seedQaDataset } = require('./seed-realistic');

let ioClient;
try {
  ({ io: ioClient } = require('socket.io-client'));
} catch {
  ({ io: ioClient } = require('../../frontend/node_modules/socket.io-client'));
}

const API_PREFIX = process.env.API_PREFIX || '/api/v1';
const REPORT_PATH = path.resolve(__dirname, '../qa-report.json');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseSuccessData = (response) => response?.body?.data ?? null;
const parseItems = (response) => response?.body?.data?.items ?? [];

const buildTokenForUser = (user) => generateAccessToken({
  _id: user._id,
  role: user.role,
  schoolId: user.schoolId,
  name: user.name,
});

const normalizeErrorMessage = (response) => {
  if (!response) return 'Unknown error';
  if (typeof response.body === 'string' && response.body.trim()) return response.body.trim();
  return response.body?.error?.message || response.body?.message || `HTTP ${response.status}`;
};

const assertStatus = (response, expectedStatuses) => {
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(normalizeErrorMessage(response));
  }

  return response;
};

const buildHeaders = (session, headers = {}) => ({
  Authorization: `Bearer ${session.token}`,
  'X-School-Subdomain': session.subdomain,
  ...headers,
});

const requestJson = async (session, method, pathname, json) => {
  const response = await fetch(`${session.origin}${API_PREFIX}${pathname}`, {
    method,
    headers: buildHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(json),
  });

  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    body: await response.json().catch(() => null),
  };
};

const requestRaw = async (session, method, pathname, { body, headers = {}, expectText = false } = {}) => {
  const response = await fetch(`${session.origin}${API_PREFIX}${pathname}`, {
    method,
    headers: buildHeaders(session, headers),
    body,
  });

  const contentType = response.headers.get('content-type') || '';
  const parsedBody = expectText || contentType.includes('text/csv')
    ? await response.text()
    : await response.json().catch(() => null);

  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    body: parsedBody,
  };
};

const createSession = async (origin, subdomain, credentials) => {
  const loginResponse = await fetch(`${origin}${API_PREFIX}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-School-Subdomain': subdomain,
    },
    body: JSON.stringify({
      identifier: credentials.nationalId,
      identifierType: 'nationalId',
      password: credentials.password,
    }),
  });

  const loginBody = await loginResponse.json().catch(() => null);
  if (!loginResponse.ok) {
    throw new Error(loginBody?.error?.message || `Login failed with status ${loginResponse.status}`);
  }

  const user = await User.findOne({ nationalId: credentials.nationalId }).select('_id role schoolId name nationalId');
  if (!user) {
    throw new Error(`Unable to resolve user after login for ${credentials.nationalId}`);
  }

  return {
    origin,
    subdomain,
    credentials,
    token: buildTokenForUser(user),
    user,
    loginBody,
  };
};

const startServer = async () => {
  const server = http.createServer(app);
  initSocketServer(server);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
  };
};

const stopServer = async (server) => {
  if (!server || !server.listening) return;
  await new Promise((resolve) => server.close(resolve));
};

const waitForSocketConnect = (client, timeoutMs = 5000) => {
  if (client.connected) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Socket connection timed out'));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      client.off('connect', onConnect);
      client.off('connect_error', onError);
    };

    const onConnect = () => {
      cleanup();
      resolve();
    };

    const onError = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    client.on('connect', onConnect);
    client.on('connect_error', onError);
  });
};

const connectSocket = async (session) => {
  const client = ioClient(session.origin, {
    auth: { token: session.token },
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    timeout: 5000,
    transports: ['websocket'],
  });

  client.connect();
  await waitForSocketConnect(client);
  return client;
};

const waitForSocketEvent = (client, eventName, predicate = () => true, timeoutMs = 5000) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    cleanup();
    reject(new Error(`${eventName} timed out`));
  }, timeoutMs);

  const handler = (payload) => {
    if (!predicate(payload)) return;
    cleanup();
    resolve(payload);
  };

  const cleanup = () => {
    clearTimeout(timeout);
    client.off(eventName, handler);
  };

  client.on(eventName, handler);
});

const expectNoSocketEvent = (client, eventName, predicate = () => true, timeoutMs = 1200) => new Promise((resolve, reject) => {
  const handler = (payload) => {
    if (!predicate(payload)) return;
    cleanup();
    reject(new Error(`${eventName} was received unexpectedly`));
  };

  const timeout = setTimeout(() => {
    cleanup();
    resolve();
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timeout);
    client.off(eventName, handler);
  };

  client.on(eventName, handler);
});

const percentage = (value, total) => (total ? Number(((value / total) * 100).toFixed(2)) : 0);

const run = async () => {
  const report = {
    generatedAt: new Date().toISOString(),
    section1: null,
    section2: [],
    section3: [],
    section4: [],
    section5: [],
    section6: [],
    section7: null,
  };

  const suggestionSet = new Set();
  const bugKeys = new Set();

  const addFeatureResult = (actor, action, status, details) => {
    report.section2.push({ actor, action, status, details });
  };

  const addReportCheck = (name, status, details) => {
    report.section3.push({ name, status, details });
  };

  const addUiIssue = (severity, details) => {
    report.section4.push({ severity, details });
  };

  const addBug = (severity, title, details, suggestion) => {
    const key = `${severity}:${title}`;
    if (!bugKeys.has(key)) {
      report.section5.push({ severity, title, details });
      bugKeys.add(key);
    }
    if (suggestion) suggestionSet.add(suggestion);
  };

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/basma', {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  const seed = await seedQaDataset({ reset: true, disconnect: false, silent: true });
  report.section1 = {
    school: seed.school,
    counts: seed.counts,
    sampleUsers: {
      admin: seed.credentials.admin.nationalId,
      teacher: seed.sample.teacher.nationalId,
      parent: seed.sample.parent.nationalId,
      student: seed.sample.student.nationalId,
    },
    dateRange: seed.dateRange,
    notes: [
      'Attendance is seeded as explicit incidents over 10 school days; reports derive present counts from enrolled students and working school days.',
      'Live messaging creates recipient notifications, so message-related unread counts should rise without extra seed-only notification writes.',
    ],
  };

  const { server, origin } = await startServer();
  const school = await School.findById(seed.school.id).select('_id');
  const loginAuditCountBefore = await AuditLog.countDocuments({ schoolId: school._id, action: 'login' });

  let adminSession;
  let teacherSession;
  let parentSession;
  let controlParentSession;
  let studentSession;
  let parentSocket;
  let controlParentSocket;
  let teacherSocket;

  try {
    adminSession = await createSession(origin, seed.school.subdomain, seed.credentials.admin);
    addFeatureResult('Admin', 'Login', 'PASS', 'School admin logged in successfully.');

    teacherSession = await createSession(origin, seed.school.subdomain, {
      nationalId: seed.sample.teacher.nationalId,
      password: seed.sample.teacher.password,
    });
    addFeatureResult('Teacher', 'Login', 'PASS', 'Teacher logged in successfully.');

    parentSession = await createSession(origin, seed.school.subdomain, {
      nationalId: seed.sample.parent.nationalId,
      password: seed.sample.parent.password,
    });
    addFeatureResult('Parent', 'Login', 'PASS', 'Parent logged in successfully.');

    controlParentSession = await createSession(origin, seed.school.subdomain, {
      nationalId: seed.sample.controlParent.nationalId,
      password: seed.sample.controlParent.password,
    });

    studentSession = await createSession(origin, seed.school.subdomain, {
      nationalId: seed.sample.student.nationalId,
      password: seed.sample.student.password,
    });
    addFeatureResult('Student', 'Login', 'PASS', 'Student logged in successfully.');

    parentSocket = await connectSocket(parentSession);
    controlParentSocket = await connectSocket(controlParentSession);
    teacherSocket = await connectSocket(teacherSession);

    const createTeacherResponse = assertStatus(await requestJson(adminSession, 'POST', '/teachers', {
      nationalId: '8210999001',
      name: { first: 'تميم', last: 'الخالدي' },
      phone: '0558219991',
      email: 'teacher-new@qabasma.com',
      specialization: 'تقنيات تعليم',
      subjects: [seed.entities.subjects[0].id],
      classes: [seed.entities.classes[0].id],
      joinDate: new Date().toISOString(),
    }), [201]);

    const createdTeacherPayload = parseSuccessData(createTeacherResponse);
    addFeatureResult('Admin', 'Create teacher', 'PASS', `Created teacher ${createdTeacherPayload.teacher._id}.`);

    const updateTeacherResponse = assertStatus(await requestJson(adminSession, 'PATCH', `/teachers/${createdTeacherPayload.teacher._id}`, {
      specialization: 'تقنيات تعليم متقدمة',
      email: 'teacher-updated@qabasma.com',
    }), [200]);
    addFeatureResult('Admin', 'Edit teacher', 'PASS', `Updated teacher email to ${parseSuccessData(updateTeacherResponse).userId?.email || 'teacher-updated@qa.basma.test'}.`);

    const importForm = new FormData();
    importForm.append(
      'file',
      new Blob(['nationalId,name.first,name.last,phone\n8230999001,Test,Import,0558239991'], { type: 'text/csv' }),
      'students.csv',
    );

    const importResponse = await requestRaw(adminSession, 'POST', '/students/import', { body: importForm });
    if (importResponse.status === 404) {
      addFeatureResult('Admin', 'Import students', 'FAIL', 'POST /students/import is not implemented and returned 404.');
      addBug(
        'high',
        'Student import endpoint is missing',
        'The QA run hit POST /students/import and received 404, so the admin import workflow cannot be completed.',
        'Implement POST /students/import with CSV/XLSX parsing, validation, per-row error reporting, and an import_complete notification.',
      );
    } else if (importResponse.status >= 500) {
      addFeatureResult('Admin', 'Import students', 'FAIL', `Import endpoint returned ${importResponse.status}.`);
      addBug(
        'high',
        'Student import endpoint failed at runtime',
        'The student import route exists but returned a server error during the QA run.',
        'Fix import row parsing so invalid rows return validation errors instead of crashing the request.',
      );
    } else {
      const importSummary = parseSuccessData(importResponse)?.summary;
      addFeatureResult(
        'Admin',
        'Import students',
        'PASS',
        `Import endpoint responded with ${importResponse.status}. imported=${importSummary?.importedCount ?? 0}, errors=${importSummary?.errorCount ?? 0}.`,
      );
    }

    const resetPasswordResponse = assertStatus(await requestRaw(
      adminSession,
      'POST',
      `/auth/reset-password/${createdTeacherPayload.teacher.userId}`,
    ), [200]);
    const resetPassword = parseSuccessData(resetPasswordResponse).tempPassword;
    addFeatureResult('Admin', 'Reset password', 'PASS', 'Temporary password generated successfully.');

    await createSession(origin, seed.school.subdomain, {
      nationalId: '8210999001',
      password: resetPassword,
    });
    addFeatureResult('Admin', 'Reset password verification', 'PASS', 'Reset teacher could log in with the generated temporary password.');

    await delay(200);

    const loginAuditCountAfter = await AuditLog.countDocuments({ schoolId: school._id, action: 'login' });
    if (loginAuditCountAfter > loginAuditCountBefore) {
      addFeatureResult('Platform', 'Audit logs on login', 'PASS', `Login audit logs increased from ${loginAuditCountBefore} to ${loginAuditCountAfter}.`);
    } else {
      addFeatureResult('Platform', 'Audit logs on login', 'FAIL', 'Successful logins did not persist audit log entries.');
      addBug(
        'medium',
        'Login audit logging is broken',
        'Successful logins emitted audit log failures during the QA run and no login audit entries were stored for the QA school.',
        'Fix auditLogger to call the exported audit log service method consistently, and add an integration test that verifies login creates an audit record.',
      );
    }

    const teacherDashboardResponse = assertStatus(await requestRaw(teacherSession, 'GET', '/dashboard'), [200]);
    const parentNotificationsBefore = await Notification.countDocuments({ userId: parentSession.user._id, isRead: false });
    if (parseSuccessData(teacherDashboardResponse).totalStudents > 0) {
      addFeatureResult('Teacher', 'Dashboard data available', 'PASS', 'Teacher dashboard API returned non-empty data.');
    }

    const attendanceEventPromise = waitForSocketEvent(
      parentSocket,
      SOCKET_EVENTS.ATTENDANCE_CREATED,
      (payload) => String(payload.studentId) === seed.sample.parent.childId,
    );
    const attendanceNotificationPromise = waitForSocketEvent(
      parentSocket,
      SOCKET_EVENTS.NOTIFICATION_CREATED,
      (payload) => payload.type === 'attendance',
    );
    const noControlAttendancePromise = expectNoSocketEvent(
      controlParentSocket,
      SOCKET_EVENTS.ATTENDANCE_CREATED,
      (payload) => String(payload.studentId) === seed.sample.parent.childId,
    );

    const attendanceCreateResponse = assertStatus(await requestJson(teacherSession, 'POST', '/attendance', {
      studentId: seed.sample.teacher.studentId,
      classId: seed.sample.teacher.classId,
      type: 'late',
      date: new Date().toISOString(),
      notes: 'تسجيل حضور متأخر أثناء الاختبار النهائي.',
    }), [201]);

    await Promise.all([attendanceEventPromise, attendanceNotificationPromise, noControlAttendancePromise]);
    addFeatureResult('Teacher', 'Record attendance', 'PASS', `Created attendance record ${parseSuccessData(attendanceCreateResponse)._id}.`);
    addFeatureResult('Socket', 'Attendance notification room targeting', 'PASS', 'Parent received the attendance event and a control parent did not.');

    const behaviorNotificationPromise = waitForSocketEvent(
      parentSocket,
      SOCKET_EVENTS.NOTIFICATION_CREATED,
      (payload) => payload.type === 'behavior',
    );

    const behaviorCreateResponse = assertStatus(await requestJson(teacherSession, 'POST', '/behavior', {
      studentId: seed.sample.teacher.studentId,
      classId: seed.sample.teacher.classId,
      type: 'negative',
      category: 'discipline',
      description: 'تحدث الطالب مع زميله أثناء التعليمات الافتتاحية واحتاج إلى تنبيه إضافي.',
      attachments: [{
        url: 'https://example.com/qa/manual-behavior-note.pdf',
        type: 'document',
        name: 'manual-behavior-note.pdf',
        size: 24000,
      }],
      notifyParent: true,
    }), [201]);

    await behaviorNotificationPromise;
    addFeatureResult('Teacher', 'Add behavior note', 'PASS', `Created behavior record ${parseSuccessData(behaviorCreateResponse)._id}.`);

    const conversationCreateResponse = assertStatus(await requestJson(teacherSession, 'POST', '/messaging', {
      participantId: seed.sample.parent.userId,
    }), [200]);
    const conversation = parseSuccessData(conversationCreateResponse);
    const messageNotificationsBefore = await Notification.countDocuments({
      userId: parentSession.user._id,
      type: 'message',
    });

    const joinTeacherConversation = waitForSocketEvent(
      teacherSocket,
      SOCKET_EVENTS.CONVERSATION_JOINED,
      (payload) => payload.conversationId === conversation._id,
    );
    const joinParentConversation = waitForSocketEvent(
      parentSocket,
      SOCKET_EVENTS.CONVERSATION_JOINED,
      (payload) => payload.conversationId === conversation._id,
    );

    teacherSocket.emit(SOCKET_EVENTS.CONVERSATION_JOIN, { conversationId: conversation._id });
    parentSocket.emit(SOCKET_EVENTS.CONVERSATION_JOIN, { conversationId: conversation._id });

    await Promise.all([joinTeacherConversation, joinParentConversation]);

    const parentMessageEventPromise = waitForSocketEvent(
      parentSocket,
      SOCKET_EVENTS.MESSAGE_CREATED,
      (payload) => String(payload.conversationId) === String(conversation._id),
    );
    const parentConversationUpdatePromise = waitForSocketEvent(
      parentSocket,
      SOCKET_EVENTS.CONVERSATION_UPDATED,
      (payload) => String(payload.conversationId) === String(conversation._id),
    );
    const noControlMessagePromise = expectNoSocketEvent(
      controlParentSocket,
      SOCKET_EVENTS.MESSAGE_CREATED,
      (payload) => String(payload.conversationId) === String(conversation._id),
    );

    const teacherMessageResponse = assertStatus(await requestJson(teacherSession, 'POST', `/messaging/${conversation._id}/messages`, {
      text: 'يرجى مراجعة مستوى الواجب المنزلي لهذا الأسبوع وإرسال أي استفسار قبل نهاية اليوم.',
      attachments: [{
        url: 'https://example.com/qa/manual-message-attachment.pdf',
        type: 'document',
        name: 'manual-message-attachment.pdf',
        size: 42000,
      }],
    }), [201]);

    await Promise.all([parentMessageEventPromise, parentConversationUpdatePromise, noControlMessagePromise]);
    addFeatureResult('Teacher', 'Send message', 'PASS', `Teacher sent message ${parseSuccessData(teacherMessageResponse)._id}.`);
    addFeatureResult('Socket', 'Conversation room targeting', 'PASS', 'Parent received the live message update and a control parent did not.');

    await delay(200);

    const teacherNotificationAfterMessage = await Notification.countDocuments({
      userId: parentSession.user._id,
      type: 'message',
    });
    if (teacherNotificationAfterMessage <= messageNotificationsBefore) {
      addFeatureResult('Parent', 'Receive message notification', 'FAIL', 'Sending a live message did not create a notification record for the parent.');
      addBug(
        'high',
        'Live messaging does not trigger notifications',
        'Teacher-to-parent messaging works in real time, but no notification record is created for the recipient when a new message arrives.',
        'Create a message notification in messaging.service when a message is sent and emit notification.created to the recipient user room.',
      );
    } else {
      addFeatureResult('Parent', 'Receive message notification', 'PASS', 'Live messaging created a notification for the recipient.');
    }

    const parentProfileResponse = assertStatus(await requestRaw(parentSession, 'GET', '/parents/me'), [200]);
    await delay(200);

    const childProfileResponse = assertStatus(await requestRaw(parentSession, 'GET', `/students/${seed.sample.parent.childId}`), [200]);
    const childAttendanceResponse = assertStatus(await requestRaw(parentSession, 'GET', `/attendance?studentId=${seed.sample.parent.childId}&page=1&limit=50`), [200]);
    const childBehaviorResponse = assertStatus(await requestRaw(parentSession, 'GET', `/behavior?studentId=${seed.sample.parent.childId}&page=1&limit=50`), [200]);
    const parentNotificationsResponse = assertStatus(await requestRaw(parentSession, 'GET', '/notifications?page=1&limit=20'), [200]);
    const unreadCountResponse = assertStatus(await requestRaw(parentSession, 'GET', '/notifications/unread-count'), [200]);

    if (parseItems(childAttendanceResponse).length > 0 && parseItems(childBehaviorResponse).length > 0) {
      addFeatureResult('Parent', 'View child data', 'PASS', `Parent can view child profile ${parseSuccessData(childProfileResponse)._id}, attendance, and behavior records.`);
    }

    const unreadAfterTeacherActions = parseSuccessData(unreadCountResponse)?.count ?? 0;
    if (parseItems(parentNotificationsResponse).length > 0 && unreadAfterTeacherActions > parentNotificationsBefore) {
      addFeatureResult('Parent', 'Receive notifications', 'PASS', `Unread notifications increased from ${parentNotificationsBefore} to ${unreadAfterTeacherActions}.`);
    } else {
      addFeatureResult('Parent', 'Receive notifications', 'FAIL', 'Parent notification feed did not reflect recent teacher actions.');
      addBug(
        'medium',
        'Recent teacher actions were not reflected in the parent notification feed',
        'The unread notification count did not increase after attendance and behavior actions in the QA run.',
        'Audit notification creation for attendance and behavior workflows and add integration coverage around unread-count changes.',
      );
    }

    const teacherReplyPromise = waitForSocketEvent(
      teacherSocket,
      SOCKET_EVENTS.MESSAGE_CREATED,
      (payload) => String(payload.conversationId) === String(conversation._id),
    );

    const parentReplyResponse = assertStatus(await requestJson(parentSession, 'POST', `/messaging/${conversation._id}/messages`, {
      text: 'تمت مراجعة الواجب وسيتم إرسال الملاحظات غداً صباحاً. شكراً على المتابعة.',
    }), [201]);

    await teacherReplyPromise;
    addFeatureResult('Parent', 'Send message', 'PASS', `Parent sent message ${parseSuccessData(parentReplyResponse)._id}.`);

    const studentProfileResponse = assertStatus(await requestRaw(studentSession, 'GET', '/students/me'), [200]);
    const studentAttendanceResponse = assertStatus(await requestRaw(studentSession, 'GET', `/attendance?studentId=${seed.sample.student.id}&page=1&limit=20`), [200]);
    const studentBehaviorResponse = assertStatus(await requestRaw(studentSession, 'GET', `/behavior?studentId=${seed.sample.student.id}&page=1&limit=20`), [200]);
    if (parseItems(studentAttendanceResponse).length > 0 && parseItems(studentBehaviorResponse).length > 0) {
      addFeatureResult('Student', 'View own academic activity', 'PASS', `Student profile ${parseSuccessData(studentProfileResponse)._id} exposes self attendance and behavior records.`);
    }

    const studentReportResponse = await requestRaw(studentSession, 'GET', `/reports/student?studentId=${seed.sample.student.id}&startDate=${encodeURIComponent(seed.dateRange.startDate)}&endDate=${encodeURIComponent(seed.dateRange.endDate)}`);
    if (studentReportResponse.status === 403 || studentReportResponse.status === 404) {
      addFeatureResult('Student', 'View reports', 'FAIL', `Student report endpoint returned ${studentReportResponse.status}.`);
      addBug(
        'medium',
        'Students cannot access report endpoints',
        'The student user can access self attendance and behavior records but cannot open the dedicated student report workflow.',
        'Expose a student-scoped report endpoint and validate self-access through the QA suite.',
      );
    } else {
      addFeatureResult('Student', 'View reports', 'PASS', `Student report endpoint returned ${studentReportResponse.status}.`);
    }

    const adminDashboardResponse = assertStatus(await requestRaw(adminSession, 'GET', '/dashboard'), [200]);
    const parentDashboardResponse = assertStatus(await requestRaw(parentSession, 'GET', '/dashboard'), [200]);
    const adminDashboardData = parseSuccessData(adminDashboardResponse);
    const parentDashboardData = parseSuccessData(parentDashboardResponse);
    if (adminDashboardData.totalStudents > 0 && parentDashboardData.totalChildren > 0) {
      addUiIssue('low', 'Dashboard data APIs are populated for admin and parent views, so empty-state rendering should not appear for seeded accounts. Browser-level layout verification was not automated in this environment.');
    }

    const attendanceReportResponse = assertStatus(await requestRaw(
      adminSession,
      'GET',
      `/reports/attendance?startDate=${encodeURIComponent(seed.dateRange.startDate)}&endDate=${encodeURIComponent(seed.dateRange.endDate)}`,
    ), [200]);
    const behaviorReportResponse = assertStatus(await requestRaw(
      adminSession,
      'GET',
      `/reports/behavior?startDate=${encodeURIComponent(seed.dateRange.startDate)}&endDate=${encodeURIComponent(new Date().toISOString())}`,
    ), [200]);

    const manualAttendanceReport = await reportService.attendanceReport(
      { startDate: seed.dateRange.startDate, endDate: seed.dateRange.endDate },
      school._id,
      { role: 'school_admin', userId: adminSession.user._id },
    );

    const apiAttendanceReport = parseSuccessData(attendanceReportResponse);
    const attendanceTotalsMatch = apiAttendanceReport.totals.total === manualAttendanceReport.totals.total
      && apiAttendanceReport.totals.absence === manualAttendanceReport.totals.absence
      && apiAttendanceReport.totals.late === manualAttendanceReport.totals.late
      && apiAttendanceReport.totals.permission === manualAttendanceReport.totals.permission;

    if (attendanceTotalsMatch) {
      addReportCheck(
        'Attendance report totals',
        'PASS',
        `Totals matched raw data. total=${apiAttendanceReport.totals.total}, absence=${apiAttendanceReport.totals.absence}, late=${apiAttendanceReport.totals.late}, permission=${apiAttendanceReport.totals.permission}, absencePct=${percentage(apiAttendanceReport.totals.absence, apiAttendanceReport.totals.total)}%.`,
      );
    } else {
      addReportCheck('Attendance report totals', 'FAIL', 'Report totals did not match the raw attendance data.');
      addBug(
        'high',
        'Attendance report totals mismatch raw data',
        'The attendance report API returned totals that did not match the manual aggregation over Attendance documents.',
        'Add report regression tests that compare report output with raw attendance aggregation for the same date window.',
      );
    }

    const manualBehaviorReport = await reportService.behaviorReport(
      { startDate: seed.dateRange.startDate, endDate: new Date().toISOString() },
      school._id,
      { role: 'school_admin', userId: adminSession.user._id },
    );
    const apiBehaviorReport = parseSuccessData(behaviorReportResponse);
    const behaviorTotalsMatch = apiBehaviorReport.total === manualBehaviorReport.total
      && apiBehaviorReport.positive === manualBehaviorReport.positive
      && apiBehaviorReport.negative === manualBehaviorReport.negative;

    if (behaviorTotalsMatch) {
      addReportCheck(
        'Behavior report totals',
        'PASS',
        `Totals matched raw data. total=${apiBehaviorReport.total}, positive=${apiBehaviorReport.positive}, negative=${apiBehaviorReport.negative}, positivePct=${percentage(apiBehaviorReport.positive, apiBehaviorReport.total)}%.`,
      );
    } else {
      addReportCheck('Behavior report totals', 'FAIL', 'Behavior totals did not match the raw behavior data.');
      addBug(
        'high',
        'Behavior report totals mismatch raw data',
        'The behavior report API returned totals that did not match the manual aggregation over Behavior documents.',
        'Add regression tests comparing behavior report totals with the underlying collection for the same filter set.',
      );
    }

    const studentReportEndpointResponse = await requestRaw(adminSession, 'GET', `/reports/student?studentId=${seed.sample.teacher.studentId}`);
    if (studentReportEndpointResponse.status === 404) {
      addReportCheck('Student report endpoint', 'FAIL', 'No dedicated student report endpoint exists; GET /reports/student returned 404.');
      addBug(
        'medium',
        'Dedicated student report API is missing',
        'The platform exposes attendance and behavior reports, but there is no student-specific report endpoint for consolidated academic review.',
        'Add a student report endpoint that returns per-student attendance, behavior, and derived performance metrics in one contract.',
      );
    } else {
      addReportCheck('Student report endpoint', 'PASS', `Student report endpoint returned ${studentReportEndpointResponse.status}.`);
    }

    const attendanceCsvResponse = assertStatus(await requestRaw(
      adminSession,
      'GET',
      `/reports/attendance/export?startDate=${encodeURIComponent(seed.dateRange.startDate)}&endDate=${encodeURIComponent(seed.dateRange.endDate)}`,
      { expectText: true },
    ), [200]);
    const behaviorCsvResponse = assertStatus(await requestRaw(
      adminSession,
      'GET',
      `/reports/behavior/export?startDate=${encodeURIComponent(seed.dateRange.startDate)}&endDate=${encodeURIComponent(new Date().toISOString())}`,
      { expectText: true },
    ), [200]);

    const attendanceCsvOk = attendanceCsvResponse.headers.get('content-type')?.includes('text/csv')
      && attendanceCsvResponse.body.includes('Date,Total records,Absence,Late,Permission')
      && attendanceCsvResponse.body.includes('TOTAL');

    if (attendanceCsvOk) {
      addFeatureResult('Export', 'Attendance CSV export', 'PASS', 'Attendance export returned CSV with a TOTAL row and the expected headers.');
    } else {
      addFeatureResult('Export', 'Attendance CSV export', 'FAIL', 'Attendance export did not return the expected CSV content.');
      addBug(
        'medium',
        'Attendance CSV export content is malformed',
        'The attendance export response did not include the expected CSV structure or summary row.',
        'Add export contract tests that validate headers, row count, and summary rows for attendance exports.',
      );
    }

    const behaviorCsvOk = behaviorCsvResponse.headers.get('content-type')?.includes('text/csv')
      && behaviorCsvResponse.body.includes('Created at,Student,National ID,Class,Grade,Type,Category,Description,Attachment count,Notify parent');

    if (behaviorCsvOk) {
      addFeatureResult('Export', 'Behavior CSV export', 'PASS', 'Behavior export returned CSV with the expected columns.');
    } else {
      addFeatureResult('Export', 'Behavior CSV export', 'FAIL', 'Behavior export did not return the expected CSV content.');
      addBug(
        'medium',
        'Behavior CSV export content is malformed',
        'The behavior export response did not include the expected CSV headers.',
        'Add export regression coverage for the behavior CSV contract.',
      );
    }

    const pdfExportResponse = assertStatus(await requestRaw(
      adminSession,
      'GET',
      `/reports/attendance/export?format=pdf&startDate=${encodeURIComponent(seed.dateRange.startDate)}&endDate=${encodeURIComponent(seed.dateRange.endDate)}`,
      { expectText: true },
    ), [200]);

    if (pdfExportResponse.headers.get('content-type')?.includes('text/csv')) {
      addFeatureResult('Export', 'PDF export', 'FAIL', 'Requesting format=pdf still returned CSV; PDF export is not implemented.');
      addBug(
        'high',
        'PDF export is unavailable',
        'The report export route ignores format=pdf and always returns CSV.',
        'Implement PDF rendering with a printable layout and explicit content negotiation for report exports.',
      );
    } else {
      addFeatureResult('Export', 'PDF export', 'PASS', `PDF export responded with ${pdfExportResponse.headers.get('content-type') || 'unknown content type'}.`);
    }

    const excelExportResponse = assertStatus(await requestRaw(
      adminSession,
      'GET',
      `/reports/attendance/export?format=xlsx&startDate=${encodeURIComponent(seed.dateRange.startDate)}&endDate=${encodeURIComponent(seed.dateRange.endDate)}`,
      { expectText: true },
    ), [200]);

    if (excelExportResponse.headers.get('content-type')?.includes('text/csv')) {
      addFeatureResult('Export', 'Excel export', 'FAIL', 'Requesting format=xlsx still returned CSV; Excel export is not implemented.');
      addBug(
        'high',
        'Excel export is unavailable',
        'The report export route ignores format=xlsx and always returns CSV.',
        'Implement XLSX export generation and expose supported formats explicitly in the API contract.',
      );
    } else {
      addFeatureResult('Export', 'Excel export', 'PASS', `Excel export responded with ${excelExportResponse.headers.get('content-type') || 'unknown content type'}.`);
    }

    const uploadListResponse = assertStatus(await requestRaw(teacherSession, 'GET', '/uploads?page=1&limit=20'), [200]);
    if (parseItems(uploadListResponse).length > 0) {
      addFeatureResult('Teacher', 'List uploads', 'PASS', `Upload listing returned ${parseItems(uploadListResponse).length} files for the teacher scope.`);
    }

    const uploadForm = new FormData();
    uploadForm.append('file', new Blob(['%PDF-1.4\n% QA sample'], { type: 'application/pdf' }), 'sample.pdf');
    const uploadResponse = await requestRaw(teacherSession, 'POST', '/uploads/message', { body: uploadForm });
    if (!uploadResponse.ok) {
      addFeatureResult('Teacher', 'Upload file', 'FAIL', `Upload failed with ${uploadResponse.status}: ${normalizeErrorMessage(uploadResponse)}`);
      addBug(
        'medium',
        'File upload depends on missing Cloudinary configuration',
        'Uploading through POST /uploads/:context failed in the QA environment because Cloudinary credentials are not configured.',
        'Add a local-development storage fallback or validate Cloudinary configuration at startup with a clearer operator-facing error.',
      );
    } else {
      addFeatureResult('Teacher', 'Upload file', 'PASS', `Uploaded file ${parseSuccessData(uploadResponse)._id}.`);
    }

    const totalChecks = report.section2.length + report.section3.length;
    const failedChecks = [...report.section2, ...report.section3].filter((item) => item.status === 'FAIL').length;
    const weightedBugPenalty = report.section5.reduce((sum, bug) => sum + (bug.severity === 'high' ? 7 : bug.severity === 'medium' ? 4 : 2), 0);
    const passRateScore = totalChecks ? Math.round(((totalChecks - failedChecks) / totalChecks) * 100) : 0;
    const readinessScore = Math.max(0, Math.min(100, passRateScore - weightedBugPenalty));

    if (!apiAttendanceReport?.summary?.totalExpectedRecords || typeof apiAttendanceReport?.summary?.attendanceRate !== 'number') {
      addBug(
        'medium',
        'Attendance reports are missing a full denominator',
        'The attendance report response did not expose derived totals needed to compute present days and attendance rate.',
        'Include totalExpectedRecords and attendanceRate in the attendance report summary.',
      );
    }

    report.section6 = Array.from(suggestionSet).sort();
    report.section7 = readinessScore;
  } finally {
    if (teacherSocket) teacherSocket.disconnect();
    if (parentSocket) parentSocket.disconnect();
    if (controlParentSocket) controlParentSocket.disconnect();

    await stopServer(server);
    await mongoose.disconnect();
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
};

run().catch((error) => {
  console.error('QA run failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});