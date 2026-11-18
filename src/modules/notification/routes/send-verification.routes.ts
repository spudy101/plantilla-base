import express from 'express';
const router = express.Router();
import SendVerificationController from '../controllers/send-verification.controller';
import SendVerificationValidator from '../validators/send-verification.validator';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';

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
  SendVerificationController.sendVerification
);

/** POST /verification/verify-code */
router.post(
  '/verify-code',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  SendVerificationValidator.verifyCode(),
  ValidatorUtil.handleValidationErrors,
  SendVerificationController.verifyCode
);

export default router;
