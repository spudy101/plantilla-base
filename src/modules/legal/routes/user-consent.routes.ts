import express from 'express';
const router = express.Router();
import UserConsentController from '../controllers/user-consent.controller';
import UserConsentValidator from '../validators/user-consent.validator';
import iamModule from '../../iam';
const { AuthMiddleware } = iamModule;
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import constantsModule from '../../../shared/constants';
const { CLIENT_ACCESS_ROLES } = constantsModule;

router.get(
  '/legal/consents',
  AuthMiddleware.requireRole(CLIENT_ACCESS_ROLES),
  RateLimitMiddleware.apiLimiter(),
  UserConsentController.getMyConsents
);

router.post(
  '/legal/consents/grant',
  AuthMiddleware.requireRole(CLIENT_ACCESS_ROLES),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  UserConsentValidator.grant(),
  ValidatorUtil.handleValidationErrors,
  UserConsentController.grant
);

router.post(
  '/legal/consents/:consentTypeId/revoke',
  AuthMiddleware.requireRole(CLIENT_ACCESS_ROLES),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  UserConsentValidator.revokeParam(),
  ValidatorUtil.handleValidationErrors,
  UserConsentController.revokeMarketing
);

export default router;
