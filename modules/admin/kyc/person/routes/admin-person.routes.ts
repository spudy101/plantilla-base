// modules/admin/kyc/routes/admin-person.routes.ts

import express = require('express');
const router = express.Router();
import PersonController = require('../controllers/admin-person.controller');
import PersonValidator = require('../validators/admin-person.validator');
import BaseValidator = require('../../../../../shared/validators/base.validator');
import AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
import RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
import RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
import RbacMiddleware = require('../../../../../shared/middlewares/rbac.middleware');
import ValidatorUtil = require('../../../../../shared/utils/validators.util');
import AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
import rbacModule = require('../../../../../shared/constants/rbac');
const { RBAC_MODULES, RBAC_ACTIONS } = rbacModule;

/**
 * GET /admin/api/kyc/person
 * Lista paginada de usuarios con filtros: search, isActive, roleId.
 * Nota: national_id y email están cifrados — la búsqueda por texto libre
 * aplica solo sobre username, first_name y last_name.
 */
router.get(
  '/person',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  PersonValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PERSON_LIST_VIEWED', { entityType: 'User', entityTable: 'users' }),
  PersonController.list
);

/**
 * GET /admin/api/kyc/person/deleted
 * Listado histórico (read-only) de clientes ELIMINADOS (deleted_at != null).
 * El listado normal (GET /person) los excluye. Estas cuentas son intocables.
 * Declarado ANTES de /person/:userId para que 'deleted' no caiga en el param UUID.
 */
router.get(
  '/person/deleted',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  PersonValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PERSON_DELETED_LIST_VIEWED', { entityType: 'User', entityTable: 'users' }),
  PersonController.listDeleted
);

/**
 * GET /admin/api/kyc/person/roles
 * Catálogo read-only de roles de CLIENTE (CLIENTE / CLIENTE_VERIFICADO) para poblar el
 * filtro por rol del listado de clientes. Evita ofrecer todos los roles del sistema.
 */
router.get(
  '/person/roles',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuditAction.declare('PERSON_ROLE_OPTIONS_VIEWED', { entityType: 'RbacRole', entityTable: 'roles' }),
  PersonController.listRoleOptions
);

/**
 * GET /admin/api/kyc/person/:userId
 * Detalle completo de un usuario: datos personales, contact (email/teléfono
 * descifrados), ubicación y rol. Incluye metadata de completitud de perfil.
 */
router.get(
  '/person/:userId([0-9a-fA-F-]{36})',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('userId', 'El usuario'),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PERSON_VIEWED', { entityType: 'User', entityTable: 'users' }),
  PersonController.getById
);

/**
 * POST /admin/api/kyc/person
 * Crea un nuevo usuario: persona + contact + user en BD.
 * Devuelve el usuario creado con su contraseña temporal (solo en esta respuesta).
 * Envía notificación de bienvenida al email proporcionado.
 *
 * Body: { firstName, lastName, nationalId, email, roleId, birthDate?, genderId?, countryId? }
 */
router.post(
  '/person',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.CREATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  PersonValidator.create(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PERSON_CREATED', { entityType: 'User', entityTable: 'users' }),
  PersonController.create
);

/**
 * PUT /admin/api/kyc/person/:userId/activate
 * Activa la cuenta de un usuario inactivo.
 * Envía notificación de activación al usuario afectado.
 */
router.put(
  '/person/:userId([0-9a-fA-F-]{36})/activate',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('userId', 'El usuario'),
  PersonValidator.activate(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PERSON_ACTIVATED', { entityType: 'User', entityTable: 'users' }),
  PersonController.activate
);

/**
 * PUT /admin/api/kyc/person/:userId/deactivate
 * Desactiva la cuenta de un usuario activo.
 * Envía notificación de desactivación al usuario afectado.
 */
router.put(
  '/person/:userId([0-9a-fA-F-]{36})/deactivate',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('userId', 'El usuario'),
  PersonValidator.deactivate(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PERSON_DEACTIVATED', { entityType: 'User', entityTable: 'users' }),
  PersonController.deactivate
);

/**
 * PUT /admin/api/kyc/person/:userId/reset-password
 * Genera y asigna una nueva contraseña temporal al usuario.
 * Actualiza el hash de la contraseña en BD.
 * Envía la contraseña temporal al email del usuario.
 */
router.put(
  '/person/:userId([0-9a-fA-F-]{36})/reset-password',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('userId', 'El usuario'),
  PersonValidator.resetPassword(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PERSON_PASSWORD_RESET', { entityType: 'User', entityTable: 'users' }),
  PersonController.resetPassword
);

/**
 * PUT /admin/api/kyc/person/:userId/disable-mfa
 * Deshabilita el TOTP/MFA del usuario en BD.
 * Solo aplica si el usuario tiene MFA activo (totp_enabled = true).
 */
router.put(
  '/person/:userId([0-9a-fA-F-]{36})/disable-mfa',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('userId', 'El usuario'),
  PersonValidator.disableMFA(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PERSON_MFA_DISABLED', { entityType: 'User', entityTable: 'users' }),
  PersonController.disableMFA
);

/**
 * PUT /admin/api/kyc/person/:userId/email
 * Cambia el email del usuario: actualiza el cifrado en BD (email + email_hash)
 * Marca email_verified_at = now().
 * Notifica tanto al email anterior como al nuevo.
 *
 * Body: { newEmail }
 */
router.put(
  '/person/:userId([0-9a-fA-F-]{36})/email',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('userId', 'El usuario'),
  PersonValidator.changeEmail(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PERSON_EMAIL_CHANGED', { entityType: 'User', entityTable: 'users' }),
  PersonController.changeEmail
);

/**
 * PUT /admin/api/kyc/person/:userId/national-id
 * Cambia el national_id del usuario: actualiza el cifrado AES y el HMAC-SHA256
 * en BD. Valida unicidad via national_id_hash antes de actualizar.
 *
 * Body: { newNationalId }
 */
router.put(
  '/person/:userId([0-9a-fA-F-]{36})/national-id',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('userId', 'El usuario'),
  PersonValidator.changeNationalId(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PERSON_NATIONAL_ID_CHANGED', { entityType: 'User', entityTable: 'users' }),
  PersonController.changeNationalId
);

/**
 * PUT /admin/api/kyc/person/:userId/role
 * Cambia el rol del usuario. No aplica a usuarios con rol 'admin'.
 * Notifica al usuario del cambio de rol con descripción del nuevo rol.
 *
 * Body: { roleId }
 */
router.put(
  '/person/:userId([0-9a-fA-F-]{36})/role',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('userId', 'El usuario'),
  PersonValidator.changeRole(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PERSON_ROLE_CHANGED', { entityType: 'User', entityTable: 'users' }),
  PersonController.changeRole
);

/**
 * DELETE /admin/api/kyc/person/:userId/delete-account
 * Elimina permanentemente la cuenta: persona, contact, user en BD.
 * Requiere que el admin confirme su propia contraseña.
 * Envía notificación de eliminación al email antes de borrarlo.
 *
 * Body: { currentPassword }
 */
router.delete(
  '/person/:userId([0-9a-fA-F-]{36})/delete-account',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.DELETE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('userId', 'El usuario'),
  PersonValidator.deleteAccount(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PERSON_ACCOUNT_DELETED', { entityType: 'User', entityTable: 'users' }),
  PersonController.deleteAccount
);

export = router;
