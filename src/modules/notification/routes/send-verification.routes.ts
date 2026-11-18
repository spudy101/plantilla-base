import express from 'express';
const router = express.Router();
import SendVerificationController from '../controllers/send-verification.controller';
import SendVerificationValidator from '../validators/send-verification.validator';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import AuditAction from '../../audit/middlewares/audit-action.middleware';

// ============================================================
// PUBLIC
// ============================================================

/** POST /verification/send-verification */
router.post(
  '/send-verification',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  SendVerificationValidator.sendVerification(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('VERIFICATION_CODE_SENT', { entityType: 'VerificationCode', entityTable: 'verification_codes' }),
  SendVerificationController.sendVerification
);

/** POST /verification/verify-code */
router.post(
  '/verify-code',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  SendVerificationValidator.verifyCode(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('VERIFICATION_CODE_VERIFIED', { entityType: 'VerificationCode', entityTable: 'verification_codes' }),
  SendVerificationController.verifyCode
);

export default router;
