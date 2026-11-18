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
import BaseValidator from '../../../shared/http/base.validator';
import AuthMiddleware from '../middlewares/auth.middleware';
import RbacMiddleware from '../middlewares/rbac.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import constantsModule from '../../../shared/constants';
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
  AdminUserController.listChangeLogs
);

export default router;
