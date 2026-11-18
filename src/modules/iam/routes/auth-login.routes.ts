import express from 'express';
const router = express.Router();
import AuthLoginController from '../controllers/auth-login.controller';
import AuthLoginValidator from '../validators/auth-login.validator';
import AuthMiddleware from '../middlewares/auth.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';

// ============================================================
// PUBLIC
// ============================================================

router.post(
  '/login',
  RateLimitMiddleware.loginIpLimiter(),
  RateLimitMiddleware.authLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  AuthLoginValidator.login(),
  ValidatorUtil.handleValidationErrors,
  AuthLoginController.login
);

router.post(
  '/verify-mfa',
  RateLimitMiddleware.authLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  AuthLoginValidator.verifyMFA(),
  ValidatorUtil.handleValidationErrors,
  AuthLoginController.verifyMFA
);

// El access token puede estar expirado — la autenticación aquí es el refresh token mismo.
// No se usa AuthMiddleware.authenticate ni RequestLockMiddleware.forAuthenticatedUsers.
//
// El limiter y el lock son los propios del refresh, agrupados por SESIÓN. Los genéricos agrupan por
// IP (authLimiter cae a `ip:` porque el token viaja en cookie, no en el body), y este endpoint se
// llama en bucle por diseño: detrás de una IP pública conviven varios usuarios que se consumían el
// cupo —y se bloqueaban el lock— entre sí, quedándose sin poder renovar la sesión.
router.post(
  '/refresh',
  RateLimitMiddleware.refreshLimiter(),
  RequestLockMiddleware.forRefresh(),
  AuthLoginValidator.refreshToken(),
  ValidatorUtil.handleValidationErrors,
  AuthLoginController.refreshToken
);

// === RF-AUTH-03: Gestión de Dispositivos Autenticados y Control de Sesiones ===

// ============================================================
// PROTECTED — sesión
// ============================================================

router.post(
  '/logout',
  AuthMiddleware.authenticate,
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuthLoginController.logout
);

router.post(
  '/logout-all',
  AuthMiddleware.authenticate,
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuthLoginController.logoutAll
);

/**
 * POST /auth/logout-others
 * Cierra todas las sesiones activas excepto la actual.
 */
// [RF-AUTH-03] | CA-02 | Cierra todas las sesiones salvo la actual
router.post(
  '/logout-others',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuthLoginController.logoutOthers
);

/**
 * DELETE /auth/sessions/:sessionId
 * Cierra una sesión específica que no sea la actual.
 */
// [RF-AUTH-03] | CA-02 | Cierra sesión individual por ID
router.delete(
  '/sessions/:sessionId',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuthLoginValidator.closeSession(),
  ValidatorUtil.handleValidationErrors,
  AuthLoginController.closeSession
);

// ============================================================
// PROTECTED — dispositivos
// ============================================================

/**
 * GET /auth/devices
 * Lista todos los dispositivos del usuario (todos los estados).
 */
// [RF-AUTH-03] | CA-01 | Lista dispositivos activos del usuario autenticado
router.get(
  '/devices',
  AuthMiddleware.authenticate,
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuthLoginController.getTrustedDevices
);

/**
 * GET /auth/devices/pending
 * Lista dispositivos pendientes de aprobación.
 * IMPORTANTE: debe ir antes de /devices/:deviceId para que Express
 * no lo interprete como parámetro.
 */
router.get(
  '/devices/pending',
  AuthMiddleware.authenticate,
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuthLoginController.getPendingDevices
);

/**
 * PATCH /auth/devices/:deviceId
 * Renombra un dispositivo. Cualquier dispositivo puede renombrarse a sí mismo.
 */
router.patch(
  '/devices/:deviceId',
  AuthMiddleware.authenticate,
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuthLoginValidator.renameDevice(),
  ValidatorUtil.handleValidationErrors,
  AuthLoginController.renameDevice
);

/**
 * POST /auth/devices/:deviceId/approve
 * Aprueba un dispositivo PENDING → TRUSTED.
 * Solo puede ejecutarse desde un dispositivo TRUSTED.
 */
router.post(
  '/devices/:deviceId/approve',
  AuthMiddleware.authenticate,
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuthLoginValidator.approveDevice(),
  ValidatorUtil.handleValidationErrors,
  AuthLoginController.approveDevice
);

/**
 * POST /auth/devices/:deviceId/block
 * Bloquea un dispositivo (trusted o pending) → BLOCKED.
 * Solo puede ejecutarse desde un dispositivo TRUSTED.
 * No se puede bloquear el único dispositivo trusted.
 */
router.post(
  '/devices/:deviceId/block',
  AuthMiddleware.authenticate,
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuthLoginValidator.blockDevice(),
  ValidatorUtil.handleValidationErrors,
  AuthLoginController.blockDevice
);

/**
 * POST /auth/devices/:deviceId/unblock
 * Desbloquea un dispositivo BLOCKED → PENDING (requiere re-aprobación).
 * Solo puede ejecutarse desde un dispositivo TRUSTED.
 */
router.post(
  '/devices/:deviceId/unblock',
  AuthMiddleware.authenticate,
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuthLoginValidator.unblockDevice(),
  ValidatorUtil.handleValidationErrors,
  AuthLoginController.unblockDevice
);

export default router;
