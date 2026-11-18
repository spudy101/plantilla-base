import express from 'express';
const router = express.Router();
import MFAController from '../controllers/mfa.controller';
import MFAValidator from '../validators/mfa.validator';
import AuthMiddleware from '../middlewares/auth.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';

/**
 * TODAS LAS RUTAS REQUIEREN AUTENTICACIÓN
 */

/** POST /iam/mfa/setup-totp */
router.post(
  '/iam/mfa/setup-totp',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  MFAController.setupTOTP
);

/** POST /iam/mfa/activate-totp */
router.post(
  '/iam/mfa/activate-totp',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  MFAValidator.activateTOTP(),
  ValidatorUtil.handleValidationErrors,
  MFAController.activateTOTP
);

/** POST /iam/mfa/verify-totp */
router.post(
  '/iam/mfa/verify-totp',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  MFAValidator.verifyTOTP(),
  ValidatorUtil.handleValidationErrors,
  MFAController.verifyTOTP
);

/** POST /iam/mfa/validate-password */
router.post(
  '/iam/mfa/validate-password',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  MFAValidator.validatePassword(),
  ValidatorUtil.handleValidationErrors,
  MFAController.validatePassword
);

/** POST /iam/mfa/deactivate-totp */
router.post(
  '/iam/mfa/deactivate-totp',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  MFAValidator.deactivateTOTP(),
  ValidatorUtil.handleValidationErrors,
  MFAController.deactivateTOTP
);

/** GET /iam/mfa/status */
router.get(
  '/iam/mfa/status',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  MFAController.getStatus
);

/** POST /iam/mfa/sms/request */
router.post(
  '/iam/mfa/sms/request',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  MFAValidator.requestSMSActivation(),
  ValidatorUtil.handleValidationErrors,
  MFAController.requestSMSActivation
);

/** POST /iam/mfa/sms/confirm */
router.post(
  '/iam/mfa/sms/confirm',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  MFAValidator.confirmSMSActivation(),
  ValidatorUtil.handleValidationErrors,
  MFAController.confirmSMSActivation
);

/** POST /iam/mfa/deactivate-sms */
router.post(
  '/iam/mfa/deactivate-sms',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  MFAValidator.deactivateSMS(),
  ValidatorUtil.handleValidationErrors,
  MFAController.deactivateSMS
);

/** PUT /iam/mfa/preferred-method */
router.put(
  '/iam/mfa/preferred-method',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  MFAValidator.updatePreferredMethod(),
  ValidatorUtil.handleValidationErrors,
  MFAController.updatePreferredMethod
);

export default router;
