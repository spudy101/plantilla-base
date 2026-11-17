import express from 'express';
const router = express.Router();
import MFAController from '../controllers/mfa.controller';
import MFAValidator from '../validators/mfa.validator';
import AuthMiddleware from '../../../../../shared/middlewares/auth.middleware';
import RateLimitMiddleware from '../../../../../shared/middlewares/rate-limit.middleware';
import RequestLockMiddleware from '../../../../../shared/middlewares/request-lock.middleware';
import ValidatorUtil from '../../../../../shared/utils/validators.util';
import AuditAction from '../../../../../shared/middlewares/audit-action.middleware';

/**
 * TODAS LAS RUTAS REQUIEREN AUTENTICACIÓN
 */

/** POST /iam/mfa/setup-totp */
router.post(
  '/iam/mfa/setup-totp',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuditAction.declare('MFA_TOTP_SETUP', { entityType: 'User', entityTable: 'users' }),
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
  AuditAction.declare('MFA_TOTP_ACTIVATED', { entityType: 'User', entityTable: 'users' }),
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
  AuditAction.declare('MFA_VERIFIED', { entityType: 'User', entityTable: 'users' }),
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
  AuditAction.declare('MFA_PASSWORD_VALIDATED', { entityType: 'User', entityTable: 'users' }),
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
  AuditAction.declare('MFA_TOTP_DEACTIVATED', { entityType: 'User', entityTable: 'users' }),
  MFAController.deactivateTOTP
);

/** GET /iam/mfa/status */
router.get(
  '/iam/mfa/status',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  AuditAction.declare('MFA_STATUS_VIEWED', { entityType: 'User', entityTable: 'users' }),
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
  AuditAction.declare('MFA_SMS_SETUP', { entityType: 'User', entityTable: 'users' }),
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
  AuditAction.declare('MFA_SMS_ACTIVATED', { entityType: 'User', entityTable: 'users' }),
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
  AuditAction.declare('MFA_SMS_DEACTIVATED', { entityType: 'User', entityTable: 'users' }),
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
  AuditAction.declare('MFA_PREFERRED_METHOD_UPDATED', { entityType: 'User', entityTable: 'users' }),
  MFAController.updatePreferredMethod
);

export default router;
