const mongoose = require('mongoose');
const School = require('../models/School.model');
const User = require('../models/User.model');
const ApiError = require('../utils/ApiError');
const { hashPassword } = require('../utils/password');
const { getPagination, getSorting, buildPagination } = require('../utils/pagination');
const { assertRequesterRole } = require('../utils/authorization');

const normalizeOptionalText = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const normalizeRequiredText = (value) => {
  if (typeof value !== 'string') return value;
  return value.trim();
};

const normalizeSubdomain = (value) => {
  if (value === undefined || value === null) return value;
  return String(value).trim().toLowerCase();
};

const buildLeaderContactPayload = (contact = {}) => {
  if (!contact || typeof contact !== 'object') return undefined;

  const payload = {};
  const name = normalizeOptionalText(contact.name);
  const phone = normalizeOptionalText(contact.phone);
  const email = normalizeOptionalText(contact.email);

  if (name !== undefined) payload.name = name;
  if (phone !== undefined) payload.phone = phone;
  if (email !== undefined) payload.email = email;

  return Object.keys(payload).length ? payload : undefined;
};

const buildAdministrativeContactPayload = (contact = {}) => {
  if (!contact || typeof contact !== 'object') return undefined;

  const payload = {};
  const phone = normalizeOptionalText(contact.phone);
  const email = normalizeOptionalText(contact.email);

  if (phone !== undefined) payload.phone = phone;
  if (email !== undefined) payload.email = email;

  return Object.keys(payload).length ? payload : undefined;
};

const buildAdministrationPayload = (administration = {}) => {
  if (!administration || typeof administration !== 'object') return undefined;

  const payload = {};
  const principal = buildLeaderContactPayload(administration.principal);
  const deputyPrincipal = buildLeaderContactPayload(administration.deputyPrincipal);
  const counselor = buildLeaderContactPayload(administration.counselor);
  const administrativeContact = buildAdministrativeContactPayload(administration.administrativeContact);

  if (principal !== undefined) payload.principal = principal;
  if (deputyPrincipal !== undefined) payload.deputyPrincipal = deputyPrincipal;
  if (counselor !== undefined) payload.counselor = counselor;
  if (administrativeContact !== undefined) payload.administrativeContact = administrativeContact;

  return Object.keys(payload).length ? payload : undefined;
};

const buildSchoolPayload = (input = {}) => {
  const payload = {};

  if (input.name !== undefined) payload.name = normalizeRequiredText(input.name);
  if (input.nameAr !== undefined) payload.nameAr = normalizeOptionalText(input.nameAr);
  if (input.subdomain !== undefined) payload.subdomain = normalizeSubdomain(input.subdomain);
  if (input.address !== undefined) payload.address = normalizeRequiredText(input.address);
  if (input.phone !== undefined) payload.phone = normalizeRequiredText(input.phone);
  if (input.email !== undefined) payload.email = normalizeOptionalText(input.email);
  if (input.academicYear !== undefined) payload.academicYear = normalizeRequiredText(input.academicYear);

  const administration = buildAdministrationPayload(input.administration);
  if (administration !== undefined) payload.administration = administration;

  return payload;
};

const buildCurrentSchoolProfilePayload = (input = {}) => {
  const payload = {};

  if (input.address !== undefined) payload.address = normalizeRequiredText(input.address);
  if (input.phone !== undefined) payload.phone = normalizeRequiredText(input.phone);
  if (input.email !== undefined) payload.email = normalizeOptionalText(input.email);
  if (input.academicYear !== undefined) payload.academicYear = normalizeRequiredText(input.academicYear);

  const administration = buildAdministrationPayload(input.administration);
  if (administration !== undefined) payload.administration = administration;

  return payload;
};

const assertSchoolAccess = (targetSchoolId, requester = {}) => {
  if (requester.role === 'super_admin') return;

  if (!requester.schoolId) {
    throw new ApiError(403, 'Missing school context');
  }

  if (String(targetSchoolId) !== String(requester.schoolId)) {
    throw new ApiError(403, 'Access denied for this school');
  }
};

/**
 * List all schools (super_admin only)
 */
const listSchools = async (query, requester = {}) => {
  assertRequesterRole(requester, ['super_admin']);

  const { page, limit, skip } = getPagination(query);
  const sort = getSorting(query, ['createdAt', 'name']);

  const filter = { isDeleted: false };
  if (query.search) filter.name = { $regex: query.search, $options: 'i' };
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';

  const [schools, total] = await Promise.all([
    School.find(filter).skip(skip).limit(limit).sort(sort),
    School.countDocuments(filter),
  ]);

  return {
    data: schools,
    meta: buildPagination(total, page, limit, {
      query,
      allowedSortFields: ['createdAt', 'name'],
    }),
  };
};

/**
 * Get a single school by id
 */
const getSchoolById = async (schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin']);
  assertSchoolAccess(schoolId, requester);

  const school = await School.findOne({ _id: schoolId, isDeleted: false });
  if (!school) throw new ApiError(404, 'School not found');
  return school;
};

/**
 * Create a new school and its first school_admin user atomically
 */
const createSchool = async ({
  name,
  nameAr,
  subdomain,
  address,
  phone,
  email,
  academicYear,
  administration,
  admin,
}, requester = {}) => {
  assertRequesterRole(requester, ['super_admin']);

  const existingSchool = await School.findOne({
    $or: [{ name, isDeleted: false }, ...(subdomain ? [{ subdomain: subdomain.toLowerCase(), isDeleted: false }] : [])],
  });
  if (existingSchool) throw new ApiError(409, 'A school with this name or subdomain already exists');

  const existingUser = await User.findOne({
    $or: [{ nationalId: admin.nationalId }, { phone: admin.phone }],
    isDeleted: false,
  });
  if (existingUser) throw new ApiError(409, 'Admin national ID or phone already in use');

  // Auto-generate subdomain from name if not provided
  const schoolSubdomain = subdomain
    ? subdomain.toLowerCase().trim()
    : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const school = await School.create(buildSchoolPayload({
    name,
    nameAr,
    subdomain: schoolSubdomain,
    address,
    phone,
    email,
    academicYear,
    administration,
  }));

  try {
    const tempPassword = `Basma@${school._id.toString().slice(-4)}`;
    const adminUser = await User.create({
      schoolId: school._id,
      role: 'school_admin',
      nationalId: admin.nationalId,
      phone: admin.phone,
      email: admin.email,
      password: tempPassword,
      name: admin.name,
      mustChangePassword: true,
    });
    return { school, adminUser, tempPassword };
  } catch (err) {
    await School.deleteOne({ _id: school._id });
    throw err;
  }
};

/**
 * Update school details
 */
const updateSchool = async (schoolId, updates, requester = {}) => {
  assertRequesterRole(requester, ['super_admin']);
  assertSchoolAccess(schoolId, requester);

  const schoolUpdates = buildSchoolPayload(updates);

  if (!Object.keys(schoolUpdates).length) {
    throw new ApiError(400, 'No school updates provided');
  }

  if (schoolUpdates.name || schoolUpdates.subdomain) {
    const duplicateFilter = {
      _id: { $ne: new mongoose.Types.ObjectId(schoolId) },
      isDeleted: false,
      $or: [],
    };

    if (schoolUpdates.name) duplicateFilter.$or.push({ name: schoolUpdates.name });
    if (schoolUpdates.subdomain) duplicateFilter.$or.push({ subdomain: schoolUpdates.subdomain });

    const existingSchool = await School.findOne(duplicateFilter);
    if (existingSchool) {
      throw new ApiError(409, 'A school with this name or subdomain already exists');
    }
  }

  const school = await School.findOneAndUpdate(
    { _id: schoolId, isDeleted: false },
    { $set: schoolUpdates },
    { new: true, runValidators: true },
  );
  if (!school) throw new ApiError(404, 'School not found');
  return school;
};

/**
 * Update the current school's operational profile in tenant context
 */
const updateCurrentSchoolProfile = async (schoolId, updates, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin']);
  assertSchoolAccess(schoolId, requester);

  const schoolUpdates = buildCurrentSchoolProfilePayload(updates);
  if (!Object.keys(schoolUpdates).length) {
    throw new ApiError(400, 'No school profile updates provided');
  }

  const school = await School.findOneAndUpdate(
    { _id: schoolId, isDeleted: false },
    { $set: schoolUpdates },
    { new: true, runValidators: true },
  );
  if (!school) throw new ApiError(404, 'School not found');
  return school;
};

/**
 * Update academic settings (terms, working days, etc.)
 */
const updateSettings = async (schoolId, settings, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin']);
  assertSchoolAccess(schoolId, requester);

  const update = {};
  if (settings.academicYear) update.academicYear = settings.academicYear;
  if (settings.terms) update.terms = settings.terms;
  if (settings.settings) {
    Object.entries(settings.settings).forEach(([k, v]) => {
      update[`settings.${k}`] = v;
    });
  }

  const school = await School.findOneAndUpdate(
    { _id: schoolId, isDeleted: false },
    { $set: update },
    { new: true, runValidators: true },
  );
  if (!school) throw new ApiError(404, 'School not found');
  return school;
};

/**
 * Soft-delete a school
 */
const deleteSchool = async (schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin']);

  const school = await School.findOneAndUpdate(
    { _id: schoolId, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date(), isActive: false } },
    { new: true },
  );
  if (!school) throw new ApiError(404, 'School not found');
};

/**
 * Get school by subdomain (public)
 */
const getBySubdomain = async (subdomain) => {
  const school = await School.findOne({
    subdomain: subdomain.toLowerCase(),
    isDeleted: false,
    isActive: true,
  });
  if (!school) throw new ApiError(404, 'School not found');
  return school;
};

/**
 * Get current school from subdomain context (req.school) or schoolId
 */
const getCurrentSchool = async (schoolOrId) => {
  if (schoolOrId && schoolOrId._id) return schoolOrId; // already a school doc
  if (!schoolOrId) throw new ApiError(400, 'No school context available');
  const school = await School.findOne({ _id: schoolOrId, isDeleted: false });
  if (!school) throw new ApiError(404, 'School not found');
  return school;
};

/**
 * Update school branding (logo, colors)
 */
const updateBranding = async (schoolId, brandingData, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin']);
  assertSchoolAccess(schoolId, requester);

  const update = {};
  if (brandingData.primaryColor) update['branding.primaryColor'] = brandingData.primaryColor;
  if (brandingData.secondaryColor) update['branding.secondaryColor'] = brandingData.secondaryColor;
  if (brandingData.accentColor !== undefined) update['branding.accentColor'] = brandingData.accentColor;
  if (brandingData.logoUrl !== undefined) update['branding.logoUrl'] = brandingData.logoUrl;
  if (brandingData.faviconUrl !== undefined) update['branding.faviconUrl'] = brandingData.faviconUrl;
  // Also allow updating the top-level logo
  if (brandingData.logo !== undefined) update.logo = brandingData.logo;

  const school = await School.findOneAndUpdate(
    { _id: schoolId, isDeleted: false },
    { $set: update },
    { new: true, runValidators: true },
  );
  if (!school) throw new ApiError(404, 'School not found');
  return school;
};

module.exports = {
  listSchools, getSchoolById, createSchool, updateSchool, updateCurrentSchoolProfile, updateSettings, deleteSchool,
  getBySubdomain, getCurrentSchool, updateBranding,
};
