// modules/admin/users/controllers/admin-user.controller.js

const AdminUserService = require('../services/admin-user.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class AdminUserController {
  /** GET /admin/api/users */
  list = asyncHandler(async (req, res) => {
    const result = await AdminUserService.list(req.query, req.user.userId);
    return ApiResponse.success(res, 'Usuarios internos obtenidos exitosamente', result);
  });

  /** GET /admin/api/users/deleted — listado histórico de usuarios internos eliminados (read-only) */
  listDeleted = asyncHandler(async (req, res) => {
    const result = await AdminUserService.listDeleted(req.query, req.user.userId);
    return ApiResponse.success(res, 'Usuarios internos eliminados obtenidos exitosamente', result);
  });

  /** GET /admin/api/users/roles — catálogo de roles internos para el filtro del listado */
  listRoleOptions = asyncHandler(async (req, res) => {
    const data = await AdminUserService.listRoleOptions(req.user.userId);
    return ApiResponse.success(res, 'Roles internos obtenidos exitosamente', data);
  });

  /** GET /admin/api/users/:userId */
  getById = asyncHandler(async (req, res) => {
    const data = await AdminUserService.getById(req.params.userId, req.user.userId);
    return ApiResponse.success(res, 'Usuario interno obtenido exitosamente', data);
  });

  /** POST /admin/api/users */
  create = asyncHandler(async (req, res) => {
    const data = await AdminUserService.create(req.body, _auditCtx(req, res));
    return ApiResponse.created(res, 'Usuario interno creado exitosamente', data);
  });

  /** PATCH /admin/api/users/:userId */
  update = asyncHandler(async (req, res) => {
    const data = await AdminUserService.update(req.params.userId, req.body, _auditCtx(req, res));
    return ApiResponse.success(res, 'Usuario interno actualizado exitosamente', data);
  });

  /** PATCH /admin/api/users/:userId/role */
  changeRole = asyncHandler(async (req, res) => {
    const result = await AdminUserService.changeRole(req.params.userId, req.body.roleId, _auditCtx(req, res));
    if (result?.pending) {
      return ApiResponse.accepted(res, 'Cambio de rol pendiente de segunda aprobación', result.approvalRequest);
    }
    return ApiResponse.success(res, 'Rol actualizado exitosamente', result);
  });

  /** PATCH /admin/api/users/:userId/status */
  changeStatus = asyncHandler(async (req, res) => {
    const data = await AdminUserService.setStatus(req.params.userId, req.body.isActive, _auditCtx(req, res));
    return ApiResponse.success(res, 'Estado del usuario actualizado exitosamente', data);
  });

  /** DELETE /admin/api/users/:userId/delete-account */
  deleteUser = asyncHandler(async (req, res) => {
    const result = await AdminUserService.deleteUser(req.params.userId, req.body.currentPassword, _auditCtx(req, res));
    if (result?.pending) {
      return ApiResponse.accepted(res, 'Eliminación pendiente de segunda aprobación', result.approvalRequest);
    }
    return ApiResponse.success(res, 'Usuario interno eliminado exitosamente', result);
  });

  /** GET /admin/api/users/:userId/sessions */
  listSessions = asyncHandler(async (req, res) => {
    const data = await AdminUserService.listSessions(req.params.userId, req.user.userId);
    return ApiResponse.success(res, 'Sesiones obtenidas exitosamente', data);
  });

  /** DELETE /admin/api/users/:userId/sessions */
  closeSessions = asyncHandler(async (req, res) => {
    const data = await AdminUserService.closeSessions(req.params.userId, _auditCtx(req, res));
    return ApiResponse.success(res, 'Sesiones cerradas exitosamente', data);
  });

  /** GET /admin/api/users/:userId/change-logs */
  listChangeLogs = asyncHandler(async (req, res) => {
    const data = await AdminUserService.listChangeLogs(req.params.userId, req.query, req.user.userId);
    return ApiResponse.success(res, 'Bitácora obtenida exitosamente', data);
  });
}

function _auditCtx(req, res) {
  return {
    adminUserId: req.user.userId,
    adminRoleName: req.user.roleName,
    adminFirstName: req.user.firstName,
    ipAddress: res.locals.auditContext.ip,
    userAgent: res.locals.auditContext.userAgent
  };
}

module.exports = new AdminUserController();
