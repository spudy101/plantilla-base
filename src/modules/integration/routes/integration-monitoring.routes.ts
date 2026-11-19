import express from 'express';
import { validate } from '../../../shared/validation/validate';
import { DashboardQuery, LogsQuery, LogIdParams, FallbackQuery } from '../requests/integration-monitoring.request';

const router = express.Router();
import IntegrationMonitoringController from '../controllers/integration-monitoring.controller';
import iamModule from '../../iam';
const { AuthMiddleware, RbacMiddleware } = iamModule;
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import rbacModule from '../../../shared/constants/rbac';
const { RBAC_MODULES, RBAC_ACTIONS } = rbacModule;


// GET /api/v1/integration/dashboard — métricas por producto + estado del circuito + fallbacks.
router.get(
  '/dashboard',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.INTEGRATION_DASHBOARD, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  validate({ query: DashboardQuery }),
  IntegrationMonitoringController.dashboard
);

// GET /api/v1/integration/providers/health — semáforo del circuit breaker por producto.
router.get(
  '/providers/health',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.PROVIDERS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  IntegrationMonitoringController.health
);

// GET /api/v1/integration/logs — drill-down por llamada (usuario + sesión).
router.get(
  '/logs',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.API_LOGS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  validate({ query: LogsQuery }),
  IntegrationMonitoringController.logs
);

// GET /api/v1/integration/logs/:apiLogId — detalle forense de una llamada.
router.get(
  '/logs/:apiLogId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.API_LOGS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  validate({ params: LogIdParams }),
  IntegrationMonitoringController.logDetail
);

// GET /api/v1/integration/fallbacks — historial de ventanas de fallback (con duración).
router.get(
  '/fallbacks',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.PROVIDERS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  validate({ query: FallbackQuery }),
  IntegrationMonitoringController.fallbacks
);

export default router;
