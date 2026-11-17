import express = require('express');
const router = express.Router();
import AdminAuditLogController = require('../controllers/admin-audit-log.controller');
import AdminAuditLogValidator = require('../validators/admin-audit-log.validator');
import AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
import RbacMiddleware = require('../../../../../shared/middlewares/rbac.middleware');
import RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
import RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
import ValidatorUtil = require('../../../../../shared/utils/validators.util');
import AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
import constantsModule = require('../../../../../shared/constants');
const { RBAC_MODULES, RBAC_ACTIONS } = constantsModule;

router.get(
  '/audit/audit-logs',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.GLOBAL_LOGS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminAuditLogValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('AUDIT_LOG_LISTED', { entityType: 'AuditLog', entityTable: 'audit_logs' }),
  AdminAuditLogController.list
);

router.get(
  '/audit/audit-logs/export',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.GLOBAL_LOGS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  AdminAuditLogValidator.exportQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('AUDIT_LOG_EXPORTED', { entityType: 'AuditLog', entityTable: 'audit_logs' }),
  AdminAuditLogController.exportLogs
);

router.get(
  '/audit/audit-logs/:auditLogId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.GLOBAL_LOGS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminAuditLogValidator.auditLogId(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('AUDIT_LOG_VIEWED', { entityType: 'AuditLog', entityTable: 'audit_logs' }),
  AdminAuditLogController.getById
);

export = router;
