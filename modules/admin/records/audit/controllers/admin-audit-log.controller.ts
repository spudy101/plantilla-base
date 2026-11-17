import AdminAuditLogService = require('../services/admin-audit-log.service');
import ApiResponse = require('../../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;
import routeParamUtilModule = require('../../../../../shared/utils/route-param.util');
const { routeParam } = routeParamUtilModule;
import authUserUtilModule = require('../../../../../shared/utils/auth-user.util');
const { requireAuthUser } = authUserUtilModule;

class AdminAuditLogController {
  list = asyncHandler(async (req, res) => {
    const result = await AdminAuditLogService.list(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Logs de auditoría obtenidos exitosamente', result);
  });

  getById = asyncHandler(async (req, res) => {
    const data = await AdminAuditLogService.getById(routeParam(req, 'auditLogId'), requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Log de auditoría obtenido exitosamente', data);
  });

  exportLogs = asyncHandler(async (req, res) => {
    const format = typeof req.query.format === 'string' ? req.query.format : 'csv';
    await AdminAuditLogService.exportToResponse(res, req.query, requireAuthUser(req).userId, format);
  });
}

export = new AdminAuditLogController();
