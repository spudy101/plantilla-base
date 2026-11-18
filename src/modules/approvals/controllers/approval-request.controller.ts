import ApprovalRequestService from '../services/approval-request.service';
import ApiResponse from '../../../shared/http/app-response.util';
import errorMiddlewareModule from '../../../shared/http/error.middleware';
const { asyncHandler } = errorMiddlewareModule;
import routeParamUtilModule from '../../../shared/http/route-param.util';
const { routeParam } = routeParamUtilModule;
import authUserUtilModule from '../../iam/utils/auth-user.util';
const { requireAuthUser } = authUserUtilModule;
import adminAuditContextUtilModule from '../../audit/utils/admin-audit-context.util';
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


export default new ApprovalRequestController();
