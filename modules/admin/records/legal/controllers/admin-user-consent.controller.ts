import AdminUserConsentService = require('../services/admin-user-consent.service');
import ApiResponse = require('../../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;
import routeParamUtilModule = require('../../../../../shared/utils/route-param.util');
const { routeParam } = routeParamUtilModule;
import authUserUtilModule = require('../../../../../shared/utils/auth-user.util');
const { requireAuthUser } = authUserUtilModule;

class AdminUserConsentController {
  list = asyncHandler(async (req, res) => {
    const result = await AdminUserConsentService.list(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Consentimientos obtenidos exitosamente', result);
  });

  getHistoryByUser = asyncHandler(async (req, res) => {
    const result = await AdminUserConsentService.getHistoryByUser(routeParam(req, 'userId'), req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Historial de consentimientos obtenido exitosamente', result);
  });
}

export = new AdminUserConsentController();
