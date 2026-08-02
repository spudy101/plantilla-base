const AdminSessionTraceService = require('../services/admin-session-trace.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class AdminSessionTraceController {
  list = asyncHandler(async (req, res) => {
    const result = await AdminSessionTraceService.listSessions(req.query, req.user.userId);
    return ApiResponse.success(res, 'Sesiones obtenidas exitosamente', result);
  });

  timeline = asyncHandler(async (req, res) => {
    const result = await AdminSessionTraceService.getSessionTimeline(req.params.sessionId, req.query, req.user.userId);
    return ApiResponse.success(res, 'Traza de sesión obtenida exitosamente', result);
  });

  entities = asyncHandler(async (req, res) => {
    const result = await AdminSessionTraceService.getSessionEntities(req.params.sessionId, req.query, req.user.userId);
    return ApiResponse.success(res, 'Entidades de la sesión obtenidas exitosamente', result);
  });
}

module.exports = new AdminSessionTraceController();
