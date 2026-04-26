const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const subjectService = require('../services/subject.service');

const getRequesterContext = (req) => ({
  role: req.user.role,
  userId: req.user._id,
});

const listSubjects = asyncHandler(async (req, res) => {
  const result = await subjectService.listSubjects(req.query, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, result.data, 'Subjects fetched', result.meta));
});

const getSubjectById = asyncHandler(async (req, res) => {
  const subject = await subjectService.getSubjectById(req.params.id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, subject, 'Subject fetched'));
});

const createSubject = asyncHandler(async (req, res) => {
  const subject = await subjectService.createSubject(req.body, req.schoolId, getRequesterContext(req));
  return res.status(201).json(new ApiResponse(201, subject, 'Subject created'));
});

const updateSubject = asyncHandler(async (req, res) => {
  const subject = await subjectService.updateSubject(req.params.id, req.schoolId, req.body, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, subject, 'Subject updated'));
});

const deleteSubject = asyncHandler(async (req, res) => {
  await subjectService.deleteSubject(req.params.id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, null, 'Subject deleted'));
});

module.exports = { listSubjects, getSubjectById, createSubject, updateSubject, deleteSubject };
