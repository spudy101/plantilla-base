// modules/admin/rbac/controllers/admin-rbac.controller.js

const AdminRbacService = require('../services/admin-rbac.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class AdminRbacController {
  /** GET /admin/api/rbac/modules */
  getCatalog = asyncHandler((req, res) => {
    return ApiResponse.success(res, 'Catálogo RBAC obtenido exitosamente', AdminRbacService.getCatalog(req.user.userId));
  });

  /** GET /admin/api/rbac/roles */
  getRoles = asyncHandler(async (req, res) => {
    return ApiResponse.success(res, 'Matriz de roles obtenida exitosamente', await AdminRbacService.getRoles(req.user.userId));
  });

  /** GET /admin/api/rbac/me — permisos efectivos del usuario autenticado */
  getMyPermissions = asyncHandler(async (req, res) => {
    const data = await AdminRbacService.getEffectivePermissions(req.user.roleName, req.user.userId);
    return ApiResponse.success(res, 'Permisos del usuario obtenidos exitosamente', data);
  });

  /** GET /admin/api/rbac/roles/:roleName/permissions */
  listOverrides = asyncHandler(async (req, res) => {
    const data = await AdminRbacService.listOverrides(req.params.roleName, req.user.userId);
    return ApiResponse.success(res, 'Permisos adicionales obtenidos exitosamente', data);
  });

  /** POST /admin/api/rbac/roles/:roleName/permissions */
  grantPermission = asyncHandler(async (req, res) => {
    const { roleName } = req.params;
    const { moduleName, action } = req.body;
    const data = await AdminRbacService.grantPermission(roleName, moduleName, action, req.user.userId);
    return ApiResponse.success(res, 'Permiso otorgado exitosamente', data, 201);
  });

  /** DELETE /admin/api/rbac/roles/:roleName/permissions/:permissionId */
  revokePermission = asyncHandler(async (req, res) => {
    const data = await AdminRbacService.revokePermission(req.params.permissionId, req.user.userId);
    return ApiResponse.success(res, 'Permiso revocado exitosamente', data);
  });
}

module.exports = new AdminRbacController();
