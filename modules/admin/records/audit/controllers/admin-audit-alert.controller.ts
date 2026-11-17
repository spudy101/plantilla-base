import AdminAuditAlertService = require('../services/admin-audit-alert.service');
import ApiResponse = require('../../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;
import routeParamUtilModule = require('../../../../../shared/utils/route-param.util');
const { routeParam } = routeParamUtilModule;
import authUserUtilModule = require('../../../../../shared/utils/auth-user.util');
const { requireAuthUser } = authUserUtilModule;

class AdminAuditAlertController {
  list = asyncHandler(async (req, res) => {
    const result = await AdminAuditAlertService.list(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Alertas de auditoría obtenidas exitosamente', result);
  });

  acknowledge = asyncHandler(async (req, res) => {
    const data = await AdminAuditAlertService.acknowledge(routeParam(req, 'alertId'), requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Alerta reconocida exitosamente', data);
  });

  acknowledgeBulk = asyncHandler(async (req, res) => {
    const data = await AdminAuditAlertService.acknowledgeBulk(req.body.alertIds, requireAuthUser(req).userId);
    return ApiResponse.success(res, `${data.acknowledged} alertas reconocidas exitosamente`, data);
  });
}

export = new AdminAuditAlertController();
