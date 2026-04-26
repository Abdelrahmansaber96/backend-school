const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const schoolService = require('../services/school.service');

const getRequesterContext = (req) => ({
  role: req.user.role,
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
 * GET /schools/current — resolve school from subdomain or user context (public-friendly)
 */
const getCurrentSchool = asyncHandler(async (req, res) => {
  const contextId = req.school || (req.user && req.user.schoolId) || req.schoolIdFromSubdomain;
  if (!contextId) {
    // No school context (e.g. super_admin on bare domain or unauthenticated) — return null gracefully
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

module.exports = {
  listSchools, getSchoolById, createSchool, updateSchool, updateCurrentSchoolProfile, updateSettings, deleteSchool,
  getCurrentSchool, updateBranding,
};
