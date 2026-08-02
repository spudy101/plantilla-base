const express = require('express');
const router = express.Router();
const AdminAuditActionCatalogController = require('../controllers/admin-audit-action-catalog.controller');
const AdminAuditActionCatalogValidator = require('../validators/admin-audit-action-catalog.validator');
const AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
const RbacMiddleware = require('../../../../../shared/middlewares/rbac.middleware');
const RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
const ValidatorUtil = require('../../../../../shared/utils/validators.util');
const AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('../../../../../shared/constants');

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

module.exports = router;
