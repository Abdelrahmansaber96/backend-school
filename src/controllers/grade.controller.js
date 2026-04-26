const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const gradeService = require('../services/grade.service');

const getRequesterContext = (req) => ({
  role: req.user.role,
  userId: req.user._id,
});

const listGrades = asyncHandler(async (req, res) => {
  const result = await gradeService.listGrades(req.query, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, result.data, 'Grades fetched', result.meta));
});

const getGradeById = asyncHandler(async (req, res) => {
  const grade = await gradeService.getGradeById(req.params.id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, grade, 'Grade fetched'));
});

const createGrade = asyncHandler(async (req, res) => {
  const grade = await gradeService.createGrade(req.body, req.schoolId, getRequesterContext(req));
  return res.status(201).json(new ApiResponse(201, grade, 'Grade created'));
});

const updateGrade = asyncHandler(async (req, res) => {
  const grade = await gradeService.updateGrade(req.params.id, req.schoolId, req.body, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, grade, 'Grade updated'));
});

const deleteGrade = asyncHandler(async (req, res) => {
  await gradeService.deleteGrade(req.params.id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, null, 'Grade deleted'));
});

const getStudentGradeProfile = asyncHandler(async (req, res) => {
  const profile = await gradeService.getStudentGradeProfile(
    req.params.studentId,
    req.schoolId,
    getRequesterContext(req),
    req.query,
  );
  return res.status(200).json(new ApiResponse(200, profile, 'Student grade profile fetched'));
});

module.exports = {
  listGrades,
  getGradeById,
  createGrade,
  updateGrade,
  deleteGrade,
  getStudentGradeProfile,
};