import express from 'express';
const router = express.Router();
import UserConsentController from '../controllers/user-consent.controller';
import UserConsentValidator from '../validators/user-consent.validator';
import AuthMiddleware from '../../iam/middlewares/auth.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import AuditAction from '../../audit/middlewares/audit-action.middleware';
import constantsModule from '../../../shared/constants';
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

export default router;
