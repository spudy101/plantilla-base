const express = require('express');
const router = express.Router();
const AuthRegisterController = require('../controllers/auth-register.controller');
const AuthRegisterValidator = require('../validators/auth-register.validator');
const RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
const ValidatorUtil = require('../../../../../shared/utils/validators.util');
const AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
const PiiMaskingMiddleware = require('../../../../../shared/middlewares/pii-masking.middleware');

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
  AuditAction.declare('USER_REGISTERED', { entityType: 'User', entityTable: 'users' }),
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
  AuditAction.declare('CREDENTIALS_RESET_REQUESTED', { entityType: 'User', entityTable: 'users' }),
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

module.exports = router;
