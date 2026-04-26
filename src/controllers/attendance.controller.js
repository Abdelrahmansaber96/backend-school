const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const attendanceService = require('../services/attendance.service');

const getRequesterContext = (req) => ({
  role: req.user.role,
  userId: req.user._id,
});

const getAttendance = asyncHandler(async (req, res) => {
  const result = await attendanceService.getAttendance(req.query, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, result.data, 'Attendance records fetched', result.meta));
});

const createAttendance = asyncHandler(async (req, res) => {
  const record = await attendanceService.createAttendance(req.body, req.schoolId, getRequesterContext(req));
  return res.status(201).json(new ApiResponse(201, record, 'Attendance recorded'));
});

const bulkCreateAttendance = asyncHandler(async (req, res) => {
  const records = await attendanceService.bulkCreateAttendance(req.body, req.schoolId, getRequesterContext(req));
  return res.status(201).json(new ApiResponse(201, records, `${records.length} attendance records saved`));
});

const updateAttendance = asyncHandler(async (req, res) => {
  const record = await attendanceService.updateAttendance(req.params.id, req.body, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, record, 'Attendance updated'));
});

const deleteAttendance = asyncHandler(async (req, res) => {
  await attendanceService.deleteAttendance(req.params.id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, null, 'Attendance record deleted'));
});

const getStudentSummary = asyncHandler(async (req, res) => {
  const summary = await attendanceService.getStudentSummary(
    req.params.studentId,
    req.schoolId,
    req.query,
    getRequesterContext(req),
  );
  return res.status(200).json(new ApiResponse(200, summary, 'Attendance summary fetched'));
});

module.exports = {
  getAttendance, createAttendance, bulkCreateAttendance,
  updateAttendance, deleteAttendance, getStudentSummary,
};
