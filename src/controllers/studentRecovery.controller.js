const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const service = require('../services/studentRecovery.service');

const identify = asyncHandler(async (req, res) => res.status(200).json(new ApiResponse(200, await service.identifyStudent(req.body), 'تم التحقق من الخطوة الأولى')));
const submit = asyncHandler(async (req, res) => { await service.submitRequest(req.body); return res.status(202).json(new ApiResponse(202, null, 'تم إرسال الطلب إلى إدارة المدرسة')); });
const complete = asyncHandler(async (req, res) => { await service.completeRecovery(req.body); return res.status(200).json(new ApiResponse(200, null, 'تم تغيير كلمة المرور بنجاح')); });
const list = asyncHandler(async (req, res) => {
  const result = await service.listRequests(req.schoolId, req.query);
  return res.status(200).json(new ApiResponse(200, result.data, 'تم جلب طلبات الاستعادة', result.meta));
});
const issueCode = asyncHandler(async (req, res) => res.status(200).json(new ApiResponse(200, await service.issueCode(req.params.id, req.schoolId, req.user._id), 'تم إنشاء رمز مؤقت')));

module.exports = { identify, submit, complete, list, issueCode };
