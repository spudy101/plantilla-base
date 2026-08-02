const ApprovalRequestService = require('../services/approval-request.service');
const ApiResponse = require('../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../shared/middlewares/error.middleware');

class ApprovalRequestController {
  list = asyncHandler(async (req, res) => {
    const result = await ApprovalRequestService.list(req.query, req.user.userId);
    return ApiResponse.success(res, 'Solicitudes de aprobación obtenidas exitosamente', result);
  });

  getPolicy = asyncHandler(async (req, res) => {
    const data = await ApprovalRequestService.getPolicy(req.user.userId);
    return ApiResponse.success(res, 'Política de doble aprobación obtenida exitosamente', data);
  });

  getById = asyncHandler(async (req, res) => {
    const data = await ApprovalRequestService.getById(req.params.id, req.user.userId);
    return ApiResponse.success(res, 'Solicitud de aprobación obtenida exitosamente', data);
  });

  resolve = asyncHandler(async (req, res) => {
    const data = await ApprovalRequestService.resolve(req.params.id, req.body, _approverCtx(req, res));
    const mensaje = req.body.decision === 'approve' ? 'Solicitud aprobada exitosamente' : 'Solicitud rechazada exitosamente';
    return ApiResponse.success(res, mensaje, data);
  });
}

function _approverCtx(req, res) {
  return {
    adminUserId: req.user.userId,
    adminRoleName: req.user.roleName,
    adminFirstName: req.user.firstName,
    ipAddress: res.locals.auditContext.ip,
    userAgent: res.locals.auditContext.userAgent
  };
}

module.exports = new ApprovalRequestController();
