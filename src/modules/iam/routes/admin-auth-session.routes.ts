// === RF-AUTH-03 (admin): Gestión de Dispositivos Autenticados y Control de Sesiones ===

import express from 'express';
const router = express.Router();
import AdminAuthSessionController from '../controllers/admin-auth-session.controller';
import AdminAuthSessionValidator from '../validators/admin-auth-session.validator';
import AuthMiddleware from '../middlewares/auth.middleware';
import RbacMiddleware from '../middlewares/rbac.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import constantsModule from '../../../shared/constants';
const { RBAC_MODULES, RBAC_ACTIONS } = constantsModule;

router.get(
  '/sessions',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.ACTIVE_SESSIONS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminAuthSessionValidator.listSessions(),
  ValidatorUtil.handleValidationErrors,
  AdminAuthSessionController.listSessions
);

router.get(
  '/sessions/user/:userId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.ACTIVE_SESSIONS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminAuthSessionValidator.sessionsByUser(),
  ValidatorUtil.handleValidationErrors,
  AdminAuthSessionController.getSessionsByUser
);

// Revocar sesión es una operación de escritura — Auditor no puede revocar
router.patch(
  '/sessions/:sessionId/revoke',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.ACTIVE_SESSIONS, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminAuthSessionValidator.revokeSession(),
  ValidatorUtil.handleValidationErrors,
  AdminAuthSessionController.revokeSession
);

router.get(
  '/attempts',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.ACTIVE_SESSIONS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminAuthSessionValidator.listAttempts(),
  ValidatorUtil.handleValidationErrors,
  AdminAuthSessionController.listAttempts
);

router.get(
  '/attempts/user/:userId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.ACTIVE_SESSIONS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminAuthSessionValidator.attemptsByUser(),
  ValidatorUtil.handleValidationErrors,
  AdminAuthSessionController.getAttemptsByUser
);

export default router;
