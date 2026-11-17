import AdminAuthSessionService = require('../services/admin-auth-session.service');
import ApiResponse = require('../../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;
import routeParamUtilModule = require('../../../../../shared/utils/route-param.util');
const { routeParam } = routeParamUtilModule;
import authUserUtilModule = require('../../../../../shared/utils/auth-user.util');
const { requireAuthUser } = authUserUtilModule;

class AdminAuthSessionController {
  listSessions = asyncHandler(async (req, res) => {
    const result = await AdminAuthSessionService.listSessions(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Sesiones obtenidas exitosamente', result);
  });

  getSessionsByUser = asyncHandler(async (req, res) => {
    const result = await AdminAuthSessionService.getSessionsByUser(routeParam(req, 'userId'), req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Sesiones del usuario obtenidas exitosamente', result);
  });

  revokeSession = asyncHandler(async (req, res) => {
    const result = await AdminAuthSessionService.revokeSession(routeParam(req, 'sessionId'), requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Sesión revocada exitosamente', result);
  });

  listAttempts = asyncHandler(async (req, res) => {
    const result = await AdminAuthSessionService.listAttempts(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Intentos de autenticación obtenidos exitosamente', result);
  });

  getAttemptsByUser = asyncHandler(async (req, res) => {
    const result = await AdminAuthSessionService.getAttemptsByUser(routeParam(req, 'userId'), req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Intentos del usuario obtenidos exitosamente', result);
  });
}

export = new AdminAuthSessionController();
