// ============================================================
// auth-biometric.routes.js
// ============================================================

const express = require('express');
const router = express.Router();
const AuthBiometricController = require('../controllers/auth-biometric.controller');
const AuthBiometricValidator = require('../validators/auth-biometric.validator');
const AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
const RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
const ValidatorUtil = require('../../../../../shared/utils/validators.util');
const AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');

// ============================================================
// PUBLIC
// ============================================================

/**
 * POST /auth/biometric/login/start
 * Genera challenge para autenticación biométrica.
 * Recibe nationalId para identificar al usuario.
 */
router.post(
  '/biometric/login/start',
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  AuthBiometricValidator.loginStart(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('BIOMETRIC_LOGIN_START', { entityType: 'User', entityTable: 'users' }),
  AuthBiometricController.loginStart
);

/**
 * POST /auth/biometric/login/finish
 * Verifica la firma y devuelve tokens.
 */
router.post(
  '/biometric/login/finish',
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  AuthBiometricValidator.loginFinish(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('BIOMETRIC_LOGIN_SUCCESS', { entityType: 'BiometricCredential', entityTable: 'biometric_credentials' }),
  AuthBiometricController.loginFinish
);

// ============================================================
// PROTECTED (requiere token válido + dispositivo TRUSTED)
// ============================================================

/**
 * POST /auth/biometric/register/start
 * Genera challenge para registro de huella.
 * Solo desde dispositivo TRUSTED.
 */
router.post(
  '/biometric/register/start',
  AuthMiddleware.authenticate,
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuthBiometricValidator.registerStart(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('BIOMETRIC_REGISTER_START', { entityType: 'UserTrustedDevice', entityTable: 'user_trusted_devices' }),
  AuthBiometricController.registerStart
);

/**
 * POST /auth/biometric/register/finish
 * Recibe llave pública y firma, registra la credencial.
 */
router.post(
  '/biometric/register/finish',
  AuthMiddleware.authenticate,
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuthBiometricValidator.registerFinish(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('BIOMETRIC_REGISTER_SUCCESS', { entityType: 'BiometricCredential', entityTable: 'biometric_credentials' }),
  AuthBiometricController.registerFinish
);

/**
 * GET /auth/biometric/credentials
 * Lista las credenciales biométricas del usuario.
 */
router.get(
  '/biometric/credentials',
  AuthMiddleware.authenticate,
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuditAction.declare('BIOMETRIC_CREDENTIALS_VIEWED', {
    entityType: 'BiometricCredential',
    entityTable: 'biometric_credentials'
  }),
  AuthBiometricController.getCredentials
);

/**
 * DELETE /auth/biometric/:credentialId
 * Elimina (desactiva) una credencial biométrica.
 */
router.delete(
  '/biometric/:credentialId',
  AuthMiddleware.authenticate,
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuthBiometricValidator.deleteCredential(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('BIOMETRIC_CREDENTIAL_DELETED', {
    entityType: 'BiometricCredential',
    entityTable: 'biometric_credentials'
  }),
  AuthBiometricController.deleteCredential
);

module.exports = router;
