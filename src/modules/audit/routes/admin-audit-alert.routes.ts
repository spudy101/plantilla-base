import express from 'express';
const router = express.Router();
import AdminAuditAlertController from '../controllers/admin-audit-alert.controller';
import AdminAuditAlertValidator from '../validators/admin-audit-alert.validator';
import iamModule from '../../iam';
const { AuthMiddleware, RbacMiddleware } = iamModule;
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import constantsModule from '../../../shared/constants';
const { RBAC_MODULES, RBAC_ACTIONS } = constantsModule;

router.get(
  '/audit/audit-alerts',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.SYSTEM_ALERTS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminAuditAlertValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  AdminAuditAlertController.list
);

router.patch(
  '/audit/audit-alerts/:alertId/acknowledge',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.SYSTEM_ALERTS, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminAuditAlertValidator.alertId(),
  ValidatorUtil.handleValidationErrors,
  AdminAuditAlertController.acknowledge
);

router.post(
  '/audit/audit-alerts/acknowledge-bulk',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.SYSTEM_ALERTS, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminAuditAlertValidator.acknowledgeBulk(),
  ValidatorUtil.handleValidationErrors,
  AdminAuditAlertController.acknowledgeBulk
);

export default router;
