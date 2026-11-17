import AdminAuditActionCatalogService = require('../services/admin-audit-action-catalog.service');
import ApiResponse = require('../../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;
import authUserUtilModule = require('../../../../../shared/utils/auth-user.util');
const { requireAuthUser } = authUserUtilModule;

class AdminAuditActionCatalogController {
  categories = asyncHandler(async (req, res) => {
    const result = await AdminAuditActionCatalogService.getCategories(requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Categorías de auditoría obtenidas exitosamente', result);
  });

  risks = asyncHandler(async (req, res) => {
    const result = await AdminAuditActionCatalogService.getRisks(requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Niveles de riesgo de auditoría obtenidos exitosamente', result);
  });

  modules = asyncHandler(async (req, res) => {
    const result = await AdminAuditActionCatalogService.getModules(requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Módulos de auditoría obtenidos exitosamente', result);
  });

  actions = asyncHandler(async (req, res) => {
    const result = await AdminAuditActionCatalogService.listActions(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Catálogo de acciones de auditoría obtenido exitosamente', result);
  });
}

export = new AdminAuditActionCatalogController();
