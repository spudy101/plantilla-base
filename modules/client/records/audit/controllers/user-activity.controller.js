const UserActivityService = require('../services/user-activity.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class UserActivityController {
  /** GET /audit/recent-activity — feed de actividad del propio usuario autenticado */
  list = asyncHandler(async (req, res) => {
    const result = await UserActivityService.getRecentActivity(req.user.userId, req.query);
    return ApiResponse.success(res, 'Actividad reciente obtenida exitosamente', result);
  });
}

module.exports = new UserActivityController();
