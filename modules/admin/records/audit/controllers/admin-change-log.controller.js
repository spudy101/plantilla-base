const ChangeLogService = require('../services/admin-change-log.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class ChangeLogController {
  listUserChangeLogs = asyncHandler(async (req, res) => {
    const result = await ChangeLogService.listUserChangeLogs(req.query, req.user.userId);
    return ApiResponse.success(res, 'Logs de cambios de usuarios obtenidos exitosamente', result);
  });
}

module.exports = new ChangeLogController();
