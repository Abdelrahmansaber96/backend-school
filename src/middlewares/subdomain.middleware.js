const School = require('../models/School.model');

/**
 * Detect school from subdomain in hostname.
 * Sets req.school (full doc) and req.schoolId from subdomain lookup.
 * Runs BEFORE auth — so public routes (e.g. GET /schools/current) can resolve branding.
 * If no subdomain is found (bare domain / localhost), continues without setting req.school.
 */
const identifySchoolBySubdomain = async (req, res, next) => {
  try {
    const host = req.hostname; // e.g. "school1.platform.com" or "localhost"

    const platformDomain = process.env.PLATFORM_DOMAIN || 'localhost';
    let subdomain = null;

    if (host === platformDomain || host === 'localhost' || host === '127.0.0.1') {
      // Bare domain — no subdomain, super_admin or direct access
      // Also check for x-school-subdomain header (for frontend dev without real subdomains)
      subdomain = req.headers['x-school-subdomain'] || null;
    } else if (host.endsWith(`.${platformDomain}`)) {
      subdomain = host.replace(`.${platformDomain}`, '');
    } else {
      // Unknown host — try header fallback
      subdomain = req.headers['x-school-subdomain'] || null;
    }

    if (subdomain) {
      const school = await School.findOne({
        subdomain: subdomain.toLowerCase(),
        isDeleted: false,
        isActive: true,
      }).lean();

      if (school) {
        req.school = school;
        req.schoolIdFromSubdomain = school._id;
      }
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = identifySchoolBySubdomain;
