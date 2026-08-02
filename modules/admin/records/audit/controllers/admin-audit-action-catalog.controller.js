const AdminAuditActionCatalogService = require('../services/admin-audit-action-catalog.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class AdminAuditActionCatalogController {
  categories = asyncHandler(async (req, res) => {
    const result = await AdminAuditActionCatalogService.getCategories(req.user.userId);
    return ApiResponse.success(res, 'Categorías de auditoría obtenidas exitosamente', result);
  });

  risks = asyncHandler(async (req, res) => {
    const result = await AdminAuditActionCatalogService.getRisks(req.user.userId);
    return ApiResponse.success(res, 'Niveles de riesgo de auditoría obtenidos exitosamente', result);
  });

  modules = asyncHandler(async (req, res) => {
    const result = await AdminAuditActionCatalogService.getModules(req.user.userId);
    return ApiResponse.success(res, 'Módulos de auditoría obtenidos exitosamente', result);
  });

  actions = asyncHandler(async (req, res) => {
    const result = await AdminAuditActionCatalogService.listActions(req.query, req.user.userId);
    return ApiResponse.success(res, 'Catálogo de acciones de auditoría obtenido exitosamente', result);
  });
}

module.exports = new AdminAuditActionCatalogController();
