import express = require('express');
const router = express.Router();
import SystemGlobalConfigController = require('../controllers/system-global-config.controller');
import SystemGlobalConfigValidator = require('../validators/system-global-config.validator');
import AuthMiddleware = require('../../../../shared/middlewares/auth.middleware');
import RbacMiddleware = require('../../../../shared/middlewares/rbac.middleware');
import RateLimitMiddleware = require('../../../../shared/middlewares/rate-limit.middleware');
import RequestLockMiddleware = require('../../../../shared/middlewares/request-lock.middleware');
import AuditAction = require('../../../../shared/middlewares/audit-action.middleware');
import ValidatorUtil = require('../../../../shared/utils/validators.util');
import rbacModule = require('../../../../shared/constants/rbac');
const { RBAC_MODULES, RBAC_ACTIONS } = rbacModule;

// Lectura — Superadmin y Auditor (y cualquier rol con ADMIN.READ)
router.get(
  '/system-config',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.SYSTEM_CONFIG, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuditAction.declare('SYSTEM_GLOBAL_CONFIG_VIEWED', { entityType: 'SystemGlobalConfig', entityTable: 'system_global_config' }),
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
  AuditAction.declare('SYSTEM_GLOBAL_CONFIG_UPDATED', { entityType: 'SystemGlobalConfig', entityTable: 'system_global_config' }),
  SystemGlobalConfigController.updateConfig
);

export = router;
