// === RF-AUTH-03 (admin): Gestión de Dispositivos Autenticados y Control de Sesiones ===

const express = require('express');
const router = express.Router();
const AdminAuthSessionController = require('../controllers/admin-auth-session.controller');
const AdminAuthSessionValidator = require('../validators/admin-auth-session.validator');
const AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
const RbacMiddleware = require('../../../../../shared/middlewares/rbac.middleware');
const RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
const ValidatorUtil = require('../../../../../shared/utils/validators.util');
const AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('../../../../../shared/constants');

router.get(
  '/sessions',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.ACTIVE_SESSIONS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminAuthSessionValidator.listSessions(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('AUTH_SESSION_LIST_VIEWED', { entityType: 'AuthSession', entityTable: 'user_sessions' }),
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
  AuditAction.declare('AUTH_SESSION_BY_USER_VIEWED', { entityType: 'InternalUser' }),
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
  AuditAction.declare('AUTH_SESSION_REVOKED', { entityType: 'AuthSession' }),
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
  AuditAction.declare('AUTH_ATTEMPTS_LIST_VIEWED', { entityType: 'AuditLog', entityTable: 'audit_logs' }),
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
  AuditAction.declare('AUTH_ATTEMPTS_BY_USER_VIEWED', { entityType: 'InternalUser' }),
  AdminAuthSessionController.getAttemptsByUser
);

module.exports = router;
