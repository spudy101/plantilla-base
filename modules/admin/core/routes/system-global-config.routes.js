const express = require('express');
const router = express.Router();
const SystemGlobalConfigController = require('../controllers/system-global-config.controller');
const SystemGlobalConfigValidator = require('../validators/system-global-config.validator');
const AuthMiddleware = require('../../../../shared/middlewares/auth.middleware');
const RbacMiddleware = require('../../../../shared/middlewares/rbac.middleware');
const RateLimitMiddleware = require('../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../shared/middlewares/request-lock.middleware');
const AuditAction = require('../../../../shared/middlewares/audit-action.middleware');
const ValidatorUtil = require('../../../../shared/utils/validators.util');
const { RBAC_MODULES, RBAC_ACTIONS } = require('../../../../shared/constants/rbac');

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

module.exports = router;
