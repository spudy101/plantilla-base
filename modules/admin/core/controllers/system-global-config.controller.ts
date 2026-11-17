import SystemGlobalConfigService = require('../services/system-global-config.service');
import ApiResponse = require('../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;
import authUserUtilModule = require('../../../../shared/utils/auth-user.util');
const { requireAuthUser } = authUserUtilModule;
import adminAuditContextUtilModule = require('../../../../shared/utils/admin-audit-context.util');
const { adminAuditContext } = adminAuditContextUtilModule;

class SystemGlobalConfigController {
  getConfig = asyncHandler(async (req, res) => {
    const data = await SystemGlobalConfigService.getConfig(requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Configuración global obtenida exitosamente', data);
  });

  updateConfig = asyncHandler(async (req, res) => {
    const user = requireAuthUser(req);
    const auditCtx = adminAuditContext(req, res);
    const data = await SystemGlobalConfigService.updateConfig(req.body, user.userId, auditCtx);
    return ApiResponse.success(res, 'Configuración global actualizada exitosamente', data);
  });
}

export = new SystemGlobalConfigController();
