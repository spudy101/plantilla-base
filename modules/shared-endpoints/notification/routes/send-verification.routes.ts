import express = require('express');
const router = express.Router();
import SendVerificationController = require('../controllers/send-verification.controller');
import SendVerificationValidator = require('../validators/send-verification.validator');
import RateLimitMiddleware = require('../../../../shared/middlewares/rate-limit.middleware');
import RequestLockMiddleware = require('../../../../shared/middlewares/request-lock.middleware');
import ValidatorUtil = require('../../../../shared/utils/validators.util');
import AuditAction = require('../../../../shared/middlewares/audit-action.middleware');

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

export = router;
