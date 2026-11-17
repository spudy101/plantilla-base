import ApprovalRequestService = require('../services/approval-request.service');
import ApiResponse = require('../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;
import routeParamUtilModule = require('../../../../shared/utils/route-param.util');
const { routeParam } = routeParamUtilModule;
import authUserUtilModule = require('../../../../shared/utils/auth-user.util');
const { requireAuthUser } = authUserUtilModule;
import adminAuditContextUtilModule = require('../../../../shared/utils/admin-audit-context.util');
const { adminAuditContext } = adminAuditContextUtilModule;

class ApprovalRequestController {
  list = asyncHandler(async (req, res) => {
    const result = await ApprovalRequestService.list(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Solicitudes de aprobación obtenidas exitosamente', result);
  });

  getPolicy = asyncHandler(async (req, res) => {
    const data = await ApprovalRequestService.getPolicy(requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Política de doble aprobación obtenida exitosamente', data);
  });

  getById = asyncHandler(async (req, res) => {
    const data = await ApprovalRequestService.getById(routeParam(req, 'id'), requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Solicitud de aprobación obtenida exitosamente', data);
  });

  resolve = asyncHandler(async (req, res) => {
    const data = await ApprovalRequestService.resolve(routeParam(req, 'id'), req.body, adminAuditContext(req, res));
    const mensaje = req.body.decision === 'approve' ? 'Solicitud aprobada exitosamente' : 'Solicitud rechazada exitosamente';
    return ApiResponse.success(res, mensaje, data);
  });
}


export = new ApprovalRequestController();
