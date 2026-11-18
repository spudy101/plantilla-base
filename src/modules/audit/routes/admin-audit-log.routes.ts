import express from 'express';
const router = express.Router();
import AdminAuditLogController from '../controllers/admin-audit-log.controller';
import AdminAuditLogValidator from '../validators/admin-audit-log.validator';
import iamModule from '../../iam';
const { AuthMiddleware, RbacMiddleware } = iamModule;
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
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
  AdminAuditLogController.list
);

router.get(
  '/audit/audit-logs/export',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.GLOBAL_LOGS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  AdminAuditLogValidator.exportQuery(),
  ValidatorUtil.handleValidationErrors,
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
  AdminAuditLogController.getById
);

export default router;
