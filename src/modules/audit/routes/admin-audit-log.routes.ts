import express from 'express';
const router = express.Router();
import AdminAuditLogController from '../controllers/admin-audit-log.controller';
import AdminAuditLogValidator from '../validators/admin-audit-log.validator';
import AuthMiddleware from '../../iam/middlewares/auth.middleware';
import RbacMiddleware from '../../iam/middlewares/rbac.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import AuditAction from '../middlewares/audit-action.middleware';
import constantsModule from '../../../shared/constants';
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

export default router;
