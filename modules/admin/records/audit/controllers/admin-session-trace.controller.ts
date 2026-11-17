import AdminSessionTraceService = require('../services/admin-session-trace.service');
import ApiResponse = require('../../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;
import routeParamUtilModule = require('../../../../../shared/utils/route-param.util');
const { routeParam } = routeParamUtilModule;
import authUserUtilModule = require('../../../../../shared/utils/auth-user.util');
const { requireAuthUser } = authUserUtilModule;

class AdminSessionTraceController {
  list = asyncHandler(async (req, res) => {
    const result = await AdminSessionTraceService.listSessions(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Sesiones obtenidas exitosamente', result);
  });

  timeline = asyncHandler(async (req, res) => {
    const result = await AdminSessionTraceService.getSessionTimeline(routeParam(req, 'sessionId'), req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Traza de sesión obtenida exitosamente', result);
  });

  entities = asyncHandler(async (req, res) => {
    const result = await AdminSessionTraceService.getSessionEntities(routeParam(req, 'sessionId'), req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Entidades de la sesión obtenidas exitosamente', result);
  });
}

export = new AdminSessionTraceController();
