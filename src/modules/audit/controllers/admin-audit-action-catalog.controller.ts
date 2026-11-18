import AdminAuditActionCatalogService from '../services/admin-audit-action-catalog.service';
import ApiResponse from '../../../shared/http/app-response.util';
import errorMiddlewareModule from '../../../shared/http/error.middleware';
const { asyncHandler } = errorMiddlewareModule;
import authUserUtilModule from '../../iam/utils/auth-user.util';
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

export default new AdminAuditActionCatalogController();
