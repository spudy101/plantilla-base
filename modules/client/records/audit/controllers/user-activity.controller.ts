import UserActivityService from '../services/user-activity.service';
import ApiResponse from '../../../../../shared/utils/app-response.util';
import errorMiddlewareModule from '../../../../../shared/middlewares/error.middleware';
const { asyncHandler } = errorMiddlewareModule;
import authUserUtilModule from '../../../../../shared/utils/auth-user.util';
const { requireAuthUser } = authUserUtilModule;

class UserActivityController {
  /** GET /audit/recent-activity — feed de actividad del propio usuario autenticado */
  list = asyncHandler(async (req, res) => {
    const result = await UserActivityService.getRecentActivity(requireAuthUser(req).userId, req.query);
    return ApiResponse.success(res, 'Actividad reciente obtenida exitosamente', result);
  });
}

export default new UserActivityController();
