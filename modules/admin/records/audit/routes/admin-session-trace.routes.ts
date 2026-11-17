// Fase 5 — API admin de sesiones (traza forense). Dominio records/audit; mismo módulo RBAC (GLOBAL_LOGS)
// que gobierna /records/audit/audit-logs. Read-only.

import express = require('express');
const router = express.Router();
import AdminSessionTraceController = require('../controllers/admin-session-trace.controller');
import AdminSessionTraceValidator = require('../validators/admin-session-trace.validator');
import AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
import RbacMiddleware = require('../../../../../shared/middlewares/rbac.middleware');
import RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
import RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
import ValidatorUtil = require('../../../../../shared/utils/validators.util');
import AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
import constantsModule = require('../../../../../shared/constants');
const { RBAC_MODULES, RBAC_ACTIONS } = constantsModule;

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

export = router;
