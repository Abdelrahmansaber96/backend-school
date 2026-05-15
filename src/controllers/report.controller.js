const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const reportService = require('../services/report.service');
const notificationService = require('../services/notification.service');

const getRequesterContext = (req) => ({
  role: req.user.role,
  userId: req.user._id,
});

const attendanceReport = asyncHandler(async (req, res) => {
  const report = await reportService.attendanceReport(req.query, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, report, 'Attendance report generated'));
});

const behaviorReport = asyncHandler(async (req, res) => {
  const report = await reportService.behaviorReport(req.query, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, report, 'Behavior report generated'));
});

const gradeReport = asyncHandler(async (req, res) => {
  const report = await reportService.gradeReport(req.query, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, report, 'Grade report generated'));
});

const studentReport = asyncHandler(async (req, res) => {
  const report = await reportService.studentReport(req.query, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, report, 'Student report generated'));
});

const exportAttendanceReport = asyncHandler(async (req, res) => {
  const file = await reportService.exportAttendanceReport(req.query, req.schoolId, getRequesterContext(req));

  await notificationService.createNotification({
    schoolId: req.schoolId,
    userId: req.user._id,
    type: 'report_ready',
    title: 'تم تجهيز تصدير تقرير الحضور',
    body: `ملف ${file.fileName} جاهز للتنزيل.`,
    data: {
      entityType: 'reports',
      extra: {
        reportType: 'attendance',
        format: file.format,
        fileName: file.fileName,
        filters: req.query,
      },
    },
    deliveryMethod: ['in_app', 'email'],
  });

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  return res.status(200).send(file.content);
});

const exportBehaviorReport = asyncHandler(async (req, res) => {
  const file = await reportService.exportBehaviorReport(req.query, req.schoolId, getRequesterContext(req));

  await notificationService.createNotification({
    schoolId: req.schoolId,
    userId: req.user._id,
    type: 'report_ready',
    title: 'تم تجهيز تصدير تقرير السلوك',
    body: `ملف ${file.fileName} جاهز للتنزيل.`,
    data: {
      entityType: 'reports',
      extra: {
        reportType: 'behavior',
        format: file.format,
        fileName: file.fileName,
        filters: req.query,
      },
    },
    deliveryMethod: ['in_app', 'email'],
  });

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  return res.status(200).send(file.content);
});

const schoolSummary = asyncHandler(async (req, res) => {
  const summary = await reportService.schoolSummary(req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, summary, 'School summary fetched'));
});

module.exports = {
  attendanceReport,
  behaviorReport,
  gradeReport,
  studentReport,
  exportAttendanceReport,
  exportBehaviorReport,
  schoolSummary,
};
