const AuditLog = require('../models/AuditLog.model');
const { getPagination, getSorting, buildPagination } = require('../utils/pagination');
const { assertRequesterRole } = require('../utils/authorization');

/**
 * Create an audit log entry (called by services/controllers)
 */
const log = async ({ schoolId, userId, action, entity, entityId, changes, ipAddress, userAgent }) => {
  try {
    return await AuditLog.create({ schoolId, userId, action, entity, entityId, changes, ipAddress, userAgent });
  } catch (err) {
    // Never throw — audit logs must not break the application
    console.error('[AuditLog] Failed to create log entry:', err.message);
    return null;
  }
};

/**
 * List audit logs with filters (school-scoped)
 */
const listLogs = async (query, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin']);

  const { page, limit, skip } = getPagination(query);
  const sort = getSorting(query, ['createdAt']);
  const filter = { schoolId };

  if (query.userId) filter.userId = query.userId;
  if (query.action) filter.action = query.action;
  if (query.entity) filter.entity = query.entity;
  if (query.entityId) filter.entityId = query.entityId;
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('userId', 'name role')
      .skip(skip).limit(limit).sort(sort),
    AuditLog.countDocuments(filter),
  ]);

  return {
    data: logs,
    meta: buildPagination(total, page, limit, {
      query,
      allowedSortFields: ['createdAt'],
    }),
  };
};

/**
 * Get logs for a specific entity (e.g., all logs for a specific student)
 */
const getEntityLogs = async (entity, entityId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin']);

  const logs = await AuditLog.find({ entity, entityId, schoolId })
    .populate('userId', 'name role')
    .sort({ createdAt: -1 })
    .limit(50);
  return logs;
};

module.exports = { log, create: log, listLogs, getEntityLogs };
