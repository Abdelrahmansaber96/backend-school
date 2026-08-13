const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const dashboardService = require('../services/dashboard.service');

const getRequesterContext = (req) => ({
  role: req.user.role,
  userId: req.user._id,
});

const getDashboard = asyncHandler(async (req, res) => {
  const summary = await dashboardService.dashboardSummary(req.schoolId, getRequesterContext(req), req.query.range);
  return res.status(200).json(new ApiResponse(200, summary, 'Dashboard data fetched'));
});

module.exports = { getDashboard };
