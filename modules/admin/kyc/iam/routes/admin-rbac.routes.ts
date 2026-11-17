// modules/admin/rbac/routes/admin-rbac.routes.ts
//
// Catálogo RBAC de solo lectura + gestión de overrides en runtime (RF-ADM-01).
//   GET    /admin/api/rbac/modules                               → catálogo módulos + acciones
//   GET    /admin/api/rbac/roles                                 → matriz de roles con permisos
//   GET    /admin/api/rbac/me                                    → permisos efectivos del autenticado
//   GET    /admin/api/rbac/roles/:roleName/permissions           → listar overrides del rol
//   POST   /admin/api/rbac/roles/:roleName/permissions           → otorgar permiso
//   DELETE /admin/api/rbac/roles/:roleName/permissions/:id       → revocar permiso

import express from 'express';
const router = express.Router();
import AdminRbacController from '../controllers/admin-rbac.controller';
import AdminRbacValidator from '../validators/admin-rbac.validator';
import AuthMiddleware from '../../../../../shared/middlewares/auth.middleware';
import RbacMiddleware from '../../../../../shared/middlewares/rbac.middleware';
import RateLimitMiddleware from '../../../../../shared/middlewares/rate-limit.middleware';
import RequestLockMiddleware from '../../../../../shared/middlewares/request-lock.middleware';
import ValidatorUtil from '../../../../../shared/utils/validators.util';
import AuditAction from '../../../../../shared/middlewares/audit-action.middleware';
import constantsModule from '../../../../../shared/constants';
const { RBAC_MODULES, RBAC_ACTIONS } = constantsModule;

// ── Catálogo: lectura sobre el módulo admin ─────────────────────────────────
router.get(
  '/iam/rbac/modules',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.ROLES_PERMISSIONS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  AuditAction.declare('RBAC_CATALOG_VIEWED', { entityType: 'RbacCatalog', entityTable: 'roles' }),
  AdminRbacController.getCatalog
);

router.get(
  '/iam/rbac/roles',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.ROLES_PERMISSIONS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  AuditAction.declare('RBAC_ROLES_VIEWED', { entityType: 'RbacRole', entityTable: 'roles' }),
  AdminRbacController.getRoles
);

// ── Permisos del usuario autenticado ─────────────────────────────────────────
// DELIBERADO: sin requirePermission — todo admin autenticado consulta SUS PROPIOS permisos
// efectivos (el front arma su menú con esto). No expone datos de terceros ni de otros roles.
router.get(
  '/iam/rbac/me',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  AuditAction.declare('RBAC_EFFECTIVE_PERMISSIONS_VIEWED', { entityType: 'RbacRole', entityTable: 'roles' }),
  AdminRbacController.getMyPermissions
);

// ── Gestión de overrides (solo SUPERADMIN llega por wildcard) ─────────────────
router.get(
  '/iam/rbac/roles/:roleName/permissions',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.ROLES_PERMISSIONS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  AdminRbacValidator.roleNameParam(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('RBAC_ROLE_PERMISSIONS_VIEWED', { entityType: 'RbacRole', entityTable: 'role_permission_overrides' }),
  AdminRbacController.listOverrides
);

router.post(
  '/iam/rbac/roles/:roleName/permissions',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.ROLES_PERMISSIONS, RBAC_ACTIONS.CREATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminRbacValidator.grantPermission(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('RBAC_PERMISSION_GRANTED', { entityType: 'RbacPermission', entityTable: 'role_permission_overrides' }),
  AdminRbacController.grantPermission
);

router.delete(
  '/iam/rbac/roles/:roleName/permissions/:permissionId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.ROLES_PERMISSIONS, RBAC_ACTIONS.DELETE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminRbacValidator.roleNameParam(),
  AdminRbacValidator.permissionIdParam(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('RBAC_PERMISSION_REVOKED', { entityType: 'RbacPermission', entityTable: 'role_permission_overrides' }),
  AdminRbacController.revokePermission
);

export default router;
