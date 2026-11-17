import express = require('express');
const router = express.Router();
import AdminUserConsentController = require('../controllers/admin-user-consent.controller');
import AdminUserConsentValidator = require('../validators/admin-user-consent.validator');
import AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
import RbacMiddleware = require('../../../../../shared/middlewares/rbac.middleware');
import RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
import RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
import ValidatorUtil = require('../../../../../shared/utils/validators.util');
import AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
import constantsModule = require('../../../../../shared/constants');
const { RBAC_MODULES, RBAC_ACTIONS } = constantsModule;

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

export = router;
