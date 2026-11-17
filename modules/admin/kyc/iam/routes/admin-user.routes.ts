// modules/admin/users/routes/admin-user.routes.ts
//
// Rutas de gestión de USUARIOS INTERNOS (RF-ADM-01).
//
// Autorización: AuthMiddleware.authenticate (deja req.user con roleName) →
// RbacMiddleware.requirePermission(ADMIN, <acción>) → 403 si no procede.
// SUPERADMIN / ADMIN_PRODUCTOS (y los roles legacy super_admin/admin) pasan
// por wildcard en la matriz RBAC.

import express from 'express';
const router = express.Router();
import AdminUserController from '../controllers/admin-user.controller';
import AdminUserValidator from '../validators/admin-user.validator';
import BaseValidator from '../../../../../shared/validators/base.validator';
import AuthMiddleware from '../../../../../shared/middlewares/auth.middleware';
import RbacMiddleware from '../../../../../shared/middlewares/rbac.middleware';
import RateLimitMiddleware from '../../../../../shared/middlewares/rate-limit.middleware';
import RequestLockMiddleware from '../../../../../shared/middlewares/request-lock.middleware';
import ValidatorUtil from '../../../../../shared/utils/validators.util';
import AuditAction from '../../../../../shared/middlewares/audit-action.middleware';
import constantsModule from '../../../../../shared/constants';
const { RBAC_MODULES, RBAC_ACTIONS } = constantsModule;

const M = RBAC_MODULES.INTERNAL_USERS;

// ── List ──────────────────────────────────────────────────────────────────
router.get(
  '/iam/users',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(M, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminUserValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('INTERNAL_USER_LIST_VIEWED', { entityType: 'InternalUser', entityTable: 'users' }),
  AdminUserController.list
);

// ── Create ────────────────────────────────────────────────────────────────
router.post(
  '/iam/users',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(M, RBAC_ACTIONS.CREATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminUserValidator.create(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('INTERNAL_USER_CREATED', { entityType: 'InternalUser', entityTable: 'users' }),
  AdminUserController.create
);

// ── Deleted list (histórico, read-only) ─────────────────────────────────────
// Declarado ANTES de /iam/users/:userId para que 'deleted' no caiga en el param.
router.get(
  '/iam/users/deleted',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(M, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminUserValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('INTERNAL_USER_DELETED_LIST_VIEWED', { entityType: 'InternalUser', entityTable: 'users' }),
  AdminUserController.listDeleted
);

// ── Roles disponibles para el filtro del listado (catálogo read-only) ────────
// Declarado ANTES de /iam/users/:userId para que 'roles' no caiga en el param.
// Solo roles internos (sin superadmin) — los mismos que filtra el listado.
router.get(
  '/iam/users/roles',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(M, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuditAction.declare('INTERNAL_USER_ROLE_OPTIONS_VIEWED', { entityType: 'RbacRole', entityTable: 'roles' }),
  AdminUserController.listRoleOptions
);

// ── Detail ────────────────────────────────────────────────────────────────
router.get(
  '/iam/users/:userId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(M, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('userId', 'El usuario'),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('INTERNAL_USER_VIEWED', { entityType: 'InternalUser', entityTable: 'users' }),
  AdminUserController.getById
);

// ── Update (datos básicos) ──────────────────────────────────────────────────
router.patch(
  '/iam/users/:userId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(M, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('userId', 'El usuario'),
  AdminUserValidator.update(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('INTERNAL_USER_UPDATED', { entityType: 'InternalUser', entityTable: 'persons' }),
  AdminUserController.update
);

// ── Asignar / cambiar rol (auditado) ────────────────────────────────────────
router.patch(
  '/iam/users/:userId/role',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(M, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('userId', 'El usuario'),
  AdminUserValidator.changeRole(),
  ValidatorUtil.handleValidationErrors,
  // Doble aprobación: gateada a nivel de service (AdminUserService.changeRole), DESPUÉS de validar
  // que el target no sea eliminado/superadmin ni un no-op, para no generar approval_requests
  // inviables. Pendiente → 202; el handler IoC reanuda con executeChangeRole.
  AuditAction.declare('INTERNAL_USER_ROLE_CHANGED', { entityType: 'InternalUser', entityTable: 'users' }),
  AdminUserController.changeRole
);

// ── Activar / desactivar (auditado) ─────────────────────────────────────────
router.patch(
  '/iam/users/:userId/status',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(M, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('userId', 'El usuario'),
  AdminUserValidator.changeStatus(),
  ValidatorUtil.handleValidationErrors,
  AdminUserController.changeStatus
);

// ── Eliminar usuario interno (ofuscación irreversible + doble aprobación) ─────
// La contraseña del admin (maker) se valida en el service; la doble aprobación se
// gatea a nivel de service (DualApprovalService.gate), no por middleware.
router.delete(
  '/iam/users/:userId/delete-account',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(M, RBAC_ACTIONS.DELETE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminUserValidator.deleteUser(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('INTERNAL_USER_DELETED', { entityType: 'InternalUser', entityTable: 'users' }),
  AdminUserController.deleteUser
);

// ── Sesiones del usuario ─────────────────────────────────────────────────────
router.get(
  '/iam/users/:userId/sessions',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(M, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('userId', 'El usuario'),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('INTERNAL_USER_SESSIONS_VIEWED', { entityType: 'InternalUser', entityTable: 'users' }),
  AdminUserController.listSessions
);

router.delete(
  '/iam/users/:userId/sessions',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(M, RBAC_ACTIONS.DELETE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('userId', 'El usuario'),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('INTERNAL_USER_SESSIONS_CLOSED', { entityType: 'InternalUser', entityTable: 'users' }),
  AdminUserController.closeSessions
);

// ── Bitácora de cambios del usuario (auditoría) ─────────────────────────────
router.get(
  '/iam/users/:userId/change-logs',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(M, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('userId', 'El usuario'),
  AdminUserValidator.changeLogsQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('INTERNAL_USER_CHANGE_LOGS_VIEWED', { entityType: 'InternalUser', entityTable: 'users' }),
  AdminUserController.listChangeLogs
);

export default router;
