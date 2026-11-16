import express = require('express');
const router = express.Router();
import UserConsentController = require('../controllers/user-consent.controller');
import UserConsentValidator = require('../validators/user-consent.validator');
import AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
import RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
import RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
import ValidatorUtil = require('../../../../../shared/utils/validators.util');
import AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
import constantsModule = require('../../../../../shared/constants');
const { CLIENT_ACCESS_ROLES } = constantsModule;

router.get(
  '/legal/consents',
  AuthMiddleware.requireRole(CLIENT_ACCESS_ROLES),
  RateLimitMiddleware.apiLimiter(),
  AuditAction.declare('CONSENT_CATALOG_VIEWED', { entityTable: 'consent_types' }),
  UserConsentController.getMyConsents
);

router.post(
  '/legal/consents/grant',
  AuthMiddleware.requireRole(CLIENT_ACCESS_ROLES),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  UserConsentValidator.grant(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('CONSENT_GRANTED', { entityType: 'UserConsent', entityTable: 'user_consents' }),
  UserConsentController.grant
);

router.post(
  '/legal/consents/:consentTypeId/revoke',
  AuthMiddleware.requireRole(CLIENT_ACCESS_ROLES),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  UserConsentValidator.revokeParam(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('CONSENT_REVOKED', { entityType: 'UserConsent', entityTable: 'user_consents' }),
  UserConsentController.revokeMarketing
);

export = router;
