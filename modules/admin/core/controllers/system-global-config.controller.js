const SystemGlobalConfigService = require('../services/system-global-config.service');
const ApiResponse = require('../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../shared/middlewares/error.middleware');

class SystemGlobalConfigController {
  getConfig = asyncHandler(async (req, res) => {
    const data = await SystemGlobalConfigService.getConfig(req.user.userId);
    return ApiResponse.success(res, 'Configuración global obtenida exitosamente', data);
  });

  updateConfig = asyncHandler(async (req, res) => {
    const auditCtx = {
      adminUserId: req.user.userId,
      ipAddress: res.locals.auditContext?.ip,
      userAgent: res.locals.auditContext?.userAgent
    };
    const data = await SystemGlobalConfigService.updateConfig(req.body, req.user.userId, auditCtx);
    return ApiResponse.success(res, 'Configuración global actualizada exitosamente', data);
  });
}

module.exports = new SystemGlobalConfigController();
