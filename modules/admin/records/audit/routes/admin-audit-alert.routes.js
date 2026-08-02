const express = require('express');
const router = express.Router();
const AdminAuditAlertController = require('../controllers/admin-audit-alert.controller');
const AdminAuditAlertValidator = require('../validators/admin-audit-alert.validator');
const AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
const RbacMiddleware = require('../../../../../shared/middlewares/rbac.middleware');
const RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
const ValidatorUtil = require('../../../../../shared/utils/validators.util');
const AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('../../../../../shared/constants');

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

module.exports = router;
