const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const auditLogService = require('../services/auditLog.service');

const getRequesterContext = (req) => ({
  role: req.user.role,
});

const listLogs = asyncHandler(async (req, res) => {
  const result = await auditLogService.listLogs(req.query, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, result.data, 'Audit logs fetched', result.meta));
});

const getEntityLogs = asyncHandler(async (req, res) => {
  const { entity, entityId } = req.params;
  const logs = await auditLogService.getEntityLogs(entity, entityId, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, logs, 'Entity audit logs fetched'));
});

module.exports = { listLogs, getEntityLogs };
