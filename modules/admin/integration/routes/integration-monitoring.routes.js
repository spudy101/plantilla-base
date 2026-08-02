const express = require('express');

const router = express.Router();
const IntegrationMonitoringController = require('../controllers/integration-monitoring.controller');
const IntegrationMonitoringValidator = require('../validators/integration-monitoring.validator');
const AuthMiddleware = require('../../../../shared/middlewares/auth.middleware');
const RbacMiddleware = require('../../../../shared/middlewares/rbac.middleware');
const RateLimitMiddleware = require('../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../shared/middlewares/request-lock.middleware');
const ValidatorUtil = require('../../../../shared/utils/validators.util');
const AuditAction = require('../../../../shared/middlewares/audit-action.middleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('../../../../shared/constants/rbac');

const DASHBOARD_ENTITY = { entityType: 'IntegrationApiLog', entityTable: 'integration_api_logs' };
const FALLBACK_ENTITY = { entityType: 'ProviderFallbackEvent', entityTable: 'provider_fallback_events' };

// GET /api/v1/integration/dashboard — métricas por producto + estado del circuito + fallbacks.
router.get(
  '/dashboard',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.INTEGRATION_DASHBOARD, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  IntegrationMonitoringValidator.dashboardQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('INTEGRATION_DASHBOARD_VIEWED', DASHBOARD_ENTITY),
  IntegrationMonitoringController.dashboard
);

// GET /api/v1/integration/providers/health — semáforo del circuit breaker por producto.
router.get(
  '/providers/health',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.PROVIDERS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuditAction.declare('PROVIDER_HEALTH_DASHBOARD_VIEWED', DASHBOARD_ENTITY),
  IntegrationMonitoringController.health
);

// GET /api/v1/integration/logs — drill-down por llamada (usuario + sesión).
router.get(
  '/logs',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.API_LOGS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  IntegrationMonitoringValidator.logsQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('INTEGRATION_LOGS_VIEWED', DASHBOARD_ENTITY),
  IntegrationMonitoringController.logs
);

// GET /api/v1/integration/logs/:apiLogId — detalle forense de una llamada.
router.get(
  '/logs/:apiLogId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.API_LOGS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  IntegrationMonitoringValidator.logIdParam(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('INTEGRATION_LOG_DETAIL_VIEWED', DASHBOARD_ENTITY),
  IntegrationMonitoringController.logDetail
);

// GET /api/v1/integration/fallbacks — historial de ventanas de fallback (con duración).
router.get(
  '/fallbacks',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.PROVIDERS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  IntegrationMonitoringValidator.fallbackQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PROVIDER_FALLBACK_HISTORY_VIEWED', FALLBACK_ENTITY),
  IntegrationMonitoringController.fallbacks
);

module.exports = router;
