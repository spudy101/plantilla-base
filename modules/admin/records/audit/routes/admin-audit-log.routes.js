const express = require('express');
const router = express.Router();
const AdminAuditLogController = require('../controllers/admin-audit-log.controller');
const AdminAuditLogValidator = require('../validators/admin-audit-log.validator');
const AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
const RbacMiddleware = require('../../../../../shared/middlewares/rbac.middleware');
const RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
const ValidatorUtil = require('../../../../../shared/utils/validators.util');
const AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('../../../../../shared/constants');

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

module.exports = router;
