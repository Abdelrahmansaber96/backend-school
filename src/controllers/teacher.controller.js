const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const teacherService = require('../services/teacher.service');

const getRequesterContext = (req) => ({
  role: req.user.role,
  userId: req.user._id,
});

const listTeachers = asyncHandler(async (req, res) => {
  const result = await teacherService.listTeachers(req.query, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, result.data, 'Teachers fetched', result.meta));
});

const getTeacherById = asyncHandler(async (req, res) => {
  const teacher = await teacherService.getTeacherById(req.params.id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, teacher, 'Teacher fetched'));
});

const createTeacher = asyncHandler(async (req, res) => {
  const result = await teacherService.createTeacher(req.body, req.schoolId, getRequesterContext(req));
  return res.status(201).json(
    new ApiResponse(201, { teacher: result.teacher, tempPassword: result.tempPassword }, 'Teacher created'),
  );
});

const updateTeacher = asyncHandler(async (req, res) => {
  const teacher = await teacherService.updateTeacher(req.params.id, req.schoolId, req.body, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, teacher, 'Teacher updated'));
});

const deleteTeacher = asyncHandler(async (req, res) => {
  await teacherService.deleteTeacher(req.params.id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, null, 'Teacher deleted'));
});

module.exports = { listTeachers, getTeacherById, createTeacher, updateTeacher, deleteTeacher };
