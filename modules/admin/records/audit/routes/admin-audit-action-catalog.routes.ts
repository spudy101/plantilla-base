import express = require('express');
const router = express.Router();
import AdminAuditActionCatalogController = require('../controllers/admin-audit-action-catalog.controller');
import AdminAuditActionCatalogValidator = require('../validators/admin-audit-action-catalog.validator');
import AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
import RbacMiddleware = require('../../../../../shared/middlewares/rbac.middleware');
import RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
import RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
import ValidatorUtil = require('../../../../../shared/utils/validators.util');
import AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
import constantsModule = require('../../../../../shared/constants');
const { RBAC_MODULES, RBAC_ACTIONS } = constantsModule;

router.get(
  '/audit/audit-action-catalog/categories',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.AUDIT_ACTION_CATALOG, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuditAction.declare('AUDIT_ACTION_CATALOG_CATEGORIES_VIEWED', { entityType: 'AuditActionCatalog' }),
  AdminAuditActionCatalogController.categories
);

router.get(
  '/audit/audit-action-catalog/risks',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.AUDIT_ACTION_CATALOG, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuditAction.declare('AUDIT_ACTION_CATALOG_RISKS_VIEWED', { entityType: 'AuditActionCatalog' }),
  AdminAuditActionCatalogController.risks
);

router.get(
  '/audit/audit-action-catalog/modules',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.AUDIT_ACTION_CATALOG, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuditAction.declare('AUDIT_ACTION_CATALOG_MODULES_VIEWED', { entityType: 'AuditActionCatalog' }),
  AdminAuditActionCatalogController.modules
);

router.get(
  '/audit/audit-action-catalog/actions',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.AUDIT_ACTION_CATALOG, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminAuditActionCatalogValidator.listActionsQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('AUDIT_ACTION_CATALOG_ACTIONS_LISTED', { entityType: 'AuditActionCatalog' }),
  AdminAuditActionCatalogController.actions
);

export = router;
