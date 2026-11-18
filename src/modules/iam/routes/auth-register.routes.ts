import express from 'express';
const router = express.Router();
import AuthRegisterController from '../controllers/auth-register.controller';
import AuthRegisterValidator from '../validators/auth-register.validator';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import PiiMaskingMiddleware from '../../../shared/security/pii-masking.middleware';

// === RF-AUTH-01: Registro de Usuario (confirmación de correo y celular) ===

// ============================================================
// PUBLIC
// ============================================================

/**
 * POST /auth/register
 */
// [RF-AUTH-01] | CA-01, CA-02, CA-03, CA-05, CA-06, CA-07
// Endpoint principal de registro. Ver service para detalle
// por criterio.
router.post(
  '/register',
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  // [RF-USR-01] | CA-06 | Exento del enmascaramiento global: durante el registro el usuario está
  // ingresando/confirmando sus propios datos y necesita verlos completos.
  PiiMaskingMiddleware.allowUnmasked(),
  AuthRegisterValidator.register(),
  ValidatorUtil.handleValidationErrors,
  AuthRegisterController.register
);

/**
 * POST /auth/reset-credentials/request
 */
router.post(
  '/reset-credentials/request',
  RateLimitMiddleware.forgotPasswordLimiter(),
  RateLimitMiddleware.authLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  AuthRegisterValidator.requestResetCredentials(),
  ValidatorUtil.handleValidationErrors,
  AuthRegisterController.requestResetCredentials
);

/**
 * POST /auth/reset-credentials/confirm
 */
router.post(
  '/reset-credentials/confirm',
  RateLimitMiddleware.authLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  AuthRegisterValidator.confirmResetCredentials(),
  ValidatorUtil.handleValidationErrors,
  AuthRegisterController.confirmResetCredentials
);

export default router;
