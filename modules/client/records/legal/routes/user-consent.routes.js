const express = require('express');
const router = express.Router();
const UserConsentController = require('../controllers/user-consent.controller');
const UserConsentValidator = require('../validators/user-consent.validator');
const AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
const RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
const ValidatorUtil = require('../../../../../shared/utils/validators.util');
const AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
const { CLIENT_ACCESS_ROLES } = require('../../../../../shared/constants');

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

module.exports = router;
