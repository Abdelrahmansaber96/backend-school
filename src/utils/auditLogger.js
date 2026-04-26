/**
 * Thin wrapper over AuditLog.service.
 * Fire-and-forget: failures are logged but never throw to the caller.
 */
const logger = require('./logger');

let auditLogService = null;

// Lazy-load to avoid circular dependencies
const getService = () => {
  if (!auditLogService) {
    auditLogService = require('../services/auditLog.service');
  }
  return auditLogService;
};

const log = async (entry) => {
  try {
    const service = getService();
    const writer = typeof service.log === 'function' ? service.log : service.create;

    if (typeof writer !== 'function') {
      throw new Error('Audit log service writer is not available');
    }

    await writer(entry);
  } catch (err) {
    logger.error('Audit log failed:', err.message);
  }
};

module.exports = { log };
