const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const schoolService = require('../services/school.service');

const getRequesterContext = (req) => ({
  role: req.user.role,
  userId: req.user._id,
  schoolId: req.schoolId || req.user.schoolId || null,
});

const listSchools = asyncHandler(async (req, res) => {
  const result = await schoolService.listSchools(req.query, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, result.data, 'Schools fetched', result.meta));
});

const getSchoolById = asyncHandler(async (req, res) => {
  const school = await schoolService.getSchoolById(req.params.id, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, school, 'School fetched'));
});

const createSchool = asyncHandler(async (req, res) => {
  const result = await schoolService.createSchool(req.body, getRequesterContext(req));
  return res.status(201).json(
    new ApiResponse(201, { school: result.school, tempPassword: result.tempPassword }, 'School created'),
  );
});

const updateSchool = asyncHandler(async (req, res) => {
  const school = await schoolService.updateSchool(req.params.id, req.body, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, school, 'School updated'));
});

const updateSchoolStatus = asyncHandler(async (req, res) => {
  const school = await schoolService.updateSchoolStatus(req.params.id, req.body, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, school, req.body.status === 'suspended' ? 'تم إيقاف المدرسة مؤقتًا' : 'تم تفعيل المدرسة'));
});

const updateCurrentSchoolProfile = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId || (req.user && req.user.schoolId);
  if (!schoolId) throw new ApiError(400, 'No school context');

  const school = await schoolService.updateCurrentSchoolProfile(schoolId, req.body, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, school, 'School profile updated'));
});

const updateSettings = asyncHandler(async (req, res) => {
  const school = await schoolService.updateSettings(req.params.id, req.body, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, school, 'Settings updated'));
});

const deleteSchool = asyncHandler(async (req, res) => {
  await schoolService.deleteSchool(req.params.id, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, null, 'School deleted'));
});

/**
 * GET /schools/current — resolve school from authenticated user context when available
 */
const getCurrentSchool = asyncHandler(async (req, res) => {
  const contextId = req.user && req.user.schoolId;
  if (!contextId) {
    // No school context (e.g. super_admin or unauthenticated public access) — return null gracefully
    return res.status(200).json(new ApiResponse(200, null, 'No school context'));
  }
  const school = await schoolService.getCurrentSchool(contextId);
  return res.status(200).json(new ApiResponse(200, school, 'Current school fetched'));
});

/**
 * PUT /schools/branding — update logo, colors
 */
const updateBranding = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId || (req.user && req.user.schoolId);
  if (!schoolId) throw new ApiError(400, 'No school context');
  const school = await schoolService.updateBranding(schoolId, req.body, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, school, 'Branding updated'));
});

const purgeCurrentSchoolData = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId || (req.user && req.user.schoolId);
  if (!schoolId) throw new ApiError(400, 'No school context');

  const result = await schoolService.purgeCurrentSchoolData(schoolId, req.body, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, result, 'School operational data deleted'));
});

const downloadCurrentSchoolBackup = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId || req.user?.schoolId;
  if (!schoolId) throw new ApiError(400, 'No school context');
  const backup = await schoolService.createSchoolBackup(schoolId, getRequesterContext(req));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="school-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  return res.status(200).send(JSON.stringify(backup, null, 2));
});

const restoreCurrentSchoolBackup = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId || req.user?.schoolId;
  if (!schoolId) throw new ApiError(400, 'No school context');
  const result = await schoolService.restoreSchoolBackup(schoolId, req.body.backup, req.body, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, result, 'تمت استعادة النسخة الاحتياطية'));
});

module.exports = {
  listSchools, getSchoolById, createSchool, updateSchool, updateSchoolStatus, updateCurrentSchoolProfile, updateSettings, deleteSchool,
  getCurrentSchool, updateBranding, purgeCurrentSchoolData,
  downloadCurrentSchoolBackup, restoreCurrentSchoolBackup,
};
