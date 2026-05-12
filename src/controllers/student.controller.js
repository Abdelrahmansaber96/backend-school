const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const studentService = require('../services/student.service');

const getRequesterContext = (req) => ({
  role: req.user.role,
  userId: req.user._id,
});

const listStudents = asyncHandler(async (req, res) => {
  const result = await studentService.listStudents(req.query, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, result.data, 'Students fetched', result.meta));
});

const getStudentById = asyncHandler(async (req, res) => {
  const student = await studentService.getStudentById(req.params.id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, student, 'Student fetched'));
});

const getMyStudentProfile = asyncHandler(async (req, res) => {
  const student = await studentService.getMyStudentProfile(req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, student, 'Student profile fetched'));
});

const createStudent = asyncHandler(async (req, res) => {
  const result = await studentService.createStudent(req.body, req.schoolId, getRequesterContext(req));
  return res.status(201).json(
    new ApiResponse(201, { student: result.student }, 'Student created'),
  );
});

const importStudents = asyncHandler(async (req, res) => {
  const result = await studentService.importStudents(req.file, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, result, 'Student import completed'));
});

const updateStudent = asyncHandler(async (req, res) => {
  const student = await studentService.updateStudent(req.params.id, req.schoolId, req.body, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, student, 'Student updated'));
});

const deleteStudent = asyncHandler(async (req, res) => {
  await studentService.deleteStudent(req.params.id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, null, 'Student deleted'));
});

module.exports = {
  listStudents,
  getStudentById,
  getMyStudentProfile,
  createStudent,
  importStudents,
  updateStudent,
  deleteStudent,
};
