import ChangeLogService = require('../services/admin-change-log.service');
import ApiResponse = require('../../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;
import authUserUtilModule = require('../../../../../shared/utils/auth-user.util');
const { requireAuthUser } = authUserUtilModule;

class ChangeLogController {
  listUserChangeLogs = asyncHandler(async (req, res) => {
    const result = await ChangeLogService.listUserChangeLogs(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Logs de cambios de usuarios obtenidos exitosamente', result);
  });
}

export = new ChangeLogController();
