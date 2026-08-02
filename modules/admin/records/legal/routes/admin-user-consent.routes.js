const express = require('express');
const router = express.Router();
const AdminUserConsentController = require('../controllers/admin-user-consent.controller');
const AdminUserConsentValidator = require('../validators/admin-user-consent.validator');
const AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
const RbacMiddleware = require('../../../../../shared/middlewares/rbac.middleware');
const RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
const ValidatorUtil = require('../../../../../shared/utils/validators.util');
const AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('../../../../../shared/constants');

router.get(
  '/legal/user-consents',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.POLICY_ACCEPTANCE, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminUserConsentValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('CONSENT_LIST_VIEWED', { entityType: 'UserConsent', entityTable: 'user_consents' }),
  AdminUserConsentController.list
);

router.get(
  '/legal/user-consents/users/:userId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.POLICY_ACCEPTANCE, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminUserConsentValidator.userId(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('CONSENT_HISTORY_VIEWED', { entityType: 'UserConsent', entityTable: 'user_consents' }),
  AdminUserConsentController.getHistoryByUser
);

module.exports = router;
