import UserActivityService = require('../services/user-activity.service');
import ApiResponse = require('../../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;
import authUserUtilModule = require('../../../../../shared/utils/auth-user.util');
const { requireAuthUser } = authUserUtilModule;

class UserActivityController {
  /** GET /audit/recent-activity — feed de actividad del propio usuario autenticado */
  list = asyncHandler(async (req, res) => {
    const result = await UserActivityService.getRecentActivity(requireAuthUser(req).userId, req.query);
    return ApiResponse.success(res, 'Actividad reciente obtenida exitosamente', result);
  });
}

export = new UserActivityController();
