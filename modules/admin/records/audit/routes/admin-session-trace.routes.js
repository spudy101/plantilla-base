// Fase 5 — API admin de sesiones (traza forense). Dominio records/audit; mismo módulo RBAC (GLOBAL_LOGS)
// que gobierna /records/audit/audit-logs. Read-only.

const express = require('express');
const router = express.Router();
const AdminSessionTraceController = require('../controllers/admin-session-trace.controller');
const AdminSessionTraceValidator = require('../validators/admin-session-trace.validator');
const AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
const RbacMiddleware = require('../../../../../shared/middlewares/rbac.middleware');
const RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
const ValidatorUtil = require('../../../../../shared/utils/validators.util');
const AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('../../../../../shared/constants');

router.get(
  '/audit/sessions',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.GLOBAL_LOGS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminSessionTraceValidator.listSessions(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('SESSION_TRACE_LIST_VIEWED', { entityType: 'AuthSession', entityTable: 'user_sessions' }),
  AdminSessionTraceController.list
);

router.get(
  '/audit/sessions/:sessionId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.GLOBAL_LOGS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminSessionTraceValidator.sessionTimeline(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('SESSION_TRACE_VIEWED', { entityType: 'AuthSession', entityTable: 'user_sessions' }),
  AdminSessionTraceController.timeline
);

router.get(
  '/audit/sessions/:sessionId/entities',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.GLOBAL_LOGS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminSessionTraceValidator.sessionEntities(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('SESSION_TRACE_ENTITIES_VIEWED', { entityType: 'AuthSession', entityTable: 'user_sessions' }),
  AdminSessionTraceController.entities
);

module.exports = router;
