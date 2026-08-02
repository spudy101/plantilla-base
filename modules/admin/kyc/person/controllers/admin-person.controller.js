const PersonService = require('../services/admin-person.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class PersonController {
  /** GET /person */
  list = asyncHandler(async (req, res) => {
    const result = await PersonService.list(req.query, req.user.userId);
    return ApiResponse.success(res, 'Usuarios obtenidos exitosamente', result);
  });

  /** GET /person/deleted — listado histórico de clientes eliminados (read-only) */
  listDeleted = asyncHandler(async (req, res) => {
    const result = await PersonService.listDeleted(req.query, req.user.userId);
    return ApiResponse.success(res, 'Clientes eliminados obtenidos exitosamente', result);
  });

  /** GET /person/roles — catálogo de roles de cliente para el filtro del listado */
  listRoleOptions = asyncHandler(async (req, res) => {
    const data = await PersonService.listRoleOptions(req.user.userId);
    return ApiResponse.success(res, 'Roles de cliente obtenidos exitosamente', data);
  });

  /** GET /person/:userId */
  getById = asyncHandler(async (req, res) => {
    const data = await PersonService.getById(req.params.userId, req.user.userId);
    return ApiResponse.success(res, 'Detalle de usuario obtenido correctamente', data);
  });

  /** POST /person */
  create = asyncHandler(async (req, res) => {
    const auditContext = {
      adminUserId: req.user.userId,
      adminFirstName: req.user.firstName,
      ipAddress: res.locals.auditContext.ip,
      userAgent: res.locals.auditContext.userAgent
    };
    const data = await PersonService.create(req.body, auditContext);
    return ApiResponse.success(res, 'Usuario creado exitosamente', data, 201);
  });

  /** PUT /person/:userId/activate */
  activate = asyncHandler(async (req, res) => {
    const data = await PersonService.activate(req.params.userId, _auditCtx(req, res));
    return ApiResponse.success(res, 'Usuario activado exitosamente', data);
  });

  /** PUT /person/:userId/deactivate */
  deactivate = asyncHandler(async (req, res) => {
    const data = await PersonService.deactivate(req.params.userId, _auditCtx(req, res));
    return ApiResponse.success(res, 'Usuario desactivado exitosamente', data);
  });

  /** PUT /person/:userId/reset-password */
  resetPassword = asyncHandler(async (req, res) => {
    const data = await PersonService.resetPassword(req.params.userId, _auditCtx(req, res));
    return ApiResponse.success(res, 'Contraseña reseteada exitosamente', data);
  });

  /** PUT /person/:userId/disable-mfa */
  disableMFA = asyncHandler(async (req, res) => {
    const data = await PersonService.disableMFA(req.params.userId, _auditCtx(req, res));
    return ApiResponse.success(res, 'MFA desactivado exitosamente', data);
  });

  /** PUT /person/:userId/email */
  changeEmail = asyncHandler(async (req, res) => {
    const data = await PersonService.changeEmail(req.params.userId, req.body.newEmail, _auditCtx(req, res));
    return ApiResponse.success(res, 'Email actualizado exitosamente', data);
  });

  /** PUT /person/:userId/national-id */
  changeNationalId = asyncHandler(async (req, res) => {
    const data = await PersonService.changeNationalId(req.params.userId, req.body.newNationalId, _auditCtx(req, res));
    return ApiResponse.success(res, 'National ID actualizado exitosamente', data);
  });

  /** PUT /person/:userId/role */
  changeRole = asyncHandler(async (req, res) => {
    const data = await PersonService.changeRole(req.params.userId, req.body.newRoleId, _auditCtx(req, res));
    return ApiResponse.success(res, 'Rol actualizado exitosamente', data);
  });

  /** DELETE /person/:userId/delete-account */
  deleteAccount = asyncHandler(async (req, res) => {
    const result = await PersonService.deleteAccount(req.params.userId, req.body.currentPassword, _auditCtx(req, res));
    if (result?.pending) {
      return ApiResponse.accepted(res, 'Eliminación pendiente de segunda aprobación', result.approvalRequest);
    }
    return ApiResponse.success(res, 'Cuenta eliminada exitosamente');
  });
}

/** @private */
function _auditCtx(req, res) {
  return {
    adminUserId: req.user.userId,
    adminRoleName: req.user.roleName,
    adminFirstName: req.user.firstName,
    ipAddress: res.locals.auditContext.ip,
    userAgent: res.locals.auditContext.userAgent
  };
}

module.exports = new PersonController();
