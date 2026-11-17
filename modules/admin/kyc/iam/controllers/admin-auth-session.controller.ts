import AdminAuthSessionService from '../services/admin-auth-session.service';
import ApiResponse from '../../../../../shared/utils/app-response.util';
import errorMiddlewareModule from '../../../../../shared/middlewares/error.middleware';
const { asyncHandler } = errorMiddlewareModule;
import routeParamUtilModule from '../../../../../shared/utils/route-param.util';
const { routeParam } = routeParamUtilModule;
import authUserUtilModule from '../../../../../shared/utils/auth-user.util';
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

export default new AdminAuthSessionController();
