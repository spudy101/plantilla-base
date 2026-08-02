const AdminAuthSessionService = require('../services/admin-auth-session.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class AdminAuthSessionController {
  listSessions = asyncHandler(async (req, res) => {
    const result = await AdminAuthSessionService.listSessions(req.query, req.user.userId);
    return ApiResponse.success(res, 'Sesiones obtenidas exitosamente', result);
  });

  getSessionsByUser = asyncHandler(async (req, res) => {
    const result = await AdminAuthSessionService.getSessionsByUser(req.params.userId, req.query, req.user.userId);
    return ApiResponse.success(res, 'Sesiones del usuario obtenidas exitosamente', result);
  });

  revokeSession = asyncHandler(async (req, res) => {
    const result = await AdminAuthSessionService.revokeSession(req.params.sessionId, req.user.userId);
    return ApiResponse.success(res, 'Sesión revocada exitosamente', result);
  });

  listAttempts = asyncHandler(async (req, res) => {
    const result = await AdminAuthSessionService.listAttempts(req.query, req.user.userId);
    return ApiResponse.success(res, 'Intentos de autenticación obtenidos exitosamente', result);
  });

  getAttemptsByUser = asyncHandler(async (req, res) => {
    const result = await AdminAuthSessionService.getAttemptsByUser(req.params.userId, req.query, req.user.userId);
    return ApiResponse.success(res, 'Intentos del usuario obtenidos exitosamente', result);
  });
}

module.exports = new AdminAuthSessionController();
