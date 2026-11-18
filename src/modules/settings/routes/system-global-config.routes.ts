import express from 'express';
const router = express.Router();
import SystemGlobalConfigController from '../controllers/system-global-config.controller';
import SystemGlobalConfigValidator from '../validators/system-global-config.validator';
import AuthMiddleware from '../../iam/middlewares/auth.middleware';
import RbacMiddleware from '../../iam/middlewares/rbac.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import rbacModule from '../../../shared/constants/rbac';
const { RBAC_MODULES, RBAC_ACTIONS } = rbacModule;

// Lectura — Superadmin y Auditor (y cualquier rol con ADMIN.READ)
router.get(
  '/system-config',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.SYSTEM_CONFIG, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  SystemGlobalConfigController.getConfig
);

// Escritura — solo roles con ADMIN.UPDATE (SUPERADMIN)
router.patch(
  '/system-config',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.SYSTEM_CONFIG, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  SystemGlobalConfigValidator.update(),
  ValidatorUtil.handleValidationErrors,
  SystemGlobalConfigController.updateConfig
);

export default router;
