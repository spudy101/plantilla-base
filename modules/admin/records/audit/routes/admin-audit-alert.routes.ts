import express from 'express';
const router = express.Router();
import AdminAuditAlertController from '../controllers/admin-audit-alert.controller';
import AdminAuditAlertValidator from '../validators/admin-audit-alert.validator';
import AuthMiddleware from '../../../../../shared/middlewares/auth.middleware';
import RbacMiddleware from '../../../../../shared/middlewares/rbac.middleware';
import RateLimitMiddleware from '../../../../../shared/middlewares/rate-limit.middleware';
import RequestLockMiddleware from '../../../../../shared/middlewares/request-lock.middleware';
import ValidatorUtil from '../../../../../shared/utils/validators.util';
import AuditAction from '../../../../../shared/middlewares/audit-action.middleware';
import constantsModule from '../../../../../shared/constants';
const { RBAC_MODULES, RBAC_ACTIONS } = constantsModule;

router.get(
  '/audit/audit-alerts',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.SYSTEM_ALERTS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminAuditAlertValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('AUDIT_ALERT_LISTED', { entityType: 'AuditAlert', entityTable: 'audit_alerts' }),
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
  AuditAction.declare('AUDIT_ALERT_ACKNOWLEDGED', { entityType: 'AuditAlert', entityTable: 'audit_alerts' }),
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
  AuditAction.declare('AUDIT_ALERTS_BULK_ACKNOWLEDGED', { entityType: 'AuditAlert', entityTable: 'audit_alerts' }),
  AdminAuditAlertController.acknowledgeBulk
);

export default router;
