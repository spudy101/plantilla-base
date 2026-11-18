// src/app.ts — la aplicación Express: middlewares globales, rutas de cada audiencia y manejo de errores.
//
// Un solo servidor. /admin y /client separan audiencias a nivel de rutas (cada una con su Swagger y su
// serverContext, que el login usa para validar el rol), no de despliegue.
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';

import SecurityMiddleware from '../shared/middlewares/security.middleware';
import CorrelationMiddleware from '../shared/middlewares/correlation.middleware';
import ErrorMiddleware from '../shared/middlewares/error.middleware';
import auditContextMiddleware from '../shared/middlewares/audit.middleware';
import loggerUtilModule from '../shared/utils/logger.util';
const { httpLogger } = loggerUtilModule;
import redisClient from '../shared/utils/redis.util';
import databaseHealth from '../shared/database/database-health';
import swaggerAdminDocs from '../config/swagger.admin';
import swaggerClientDocs from '../config/swagger.client';
import packageModule from '../package.json';
const { version } = packageModule;

// ── Rutas compartidas (admin + client) ─────────────────────────────────────
import authLoginRoutes from '../modules/shared-endpoints/kyc/iam/routes/auth-login.routes';
import maintainersRoutes from '../modules/shared-endpoints/kyc/maintainers/routes/maintainers.routes';
import mfaRoutes from '../modules/shared-endpoints/kyc/iam/routes/mfa.routes';
import notificationPreferenceRoutes from '../modules/shared-endpoints/kyc/person/routes/notification-preference.routes';
import profileRoutes from '../modules/shared-endpoints/kyc/person/routes/profile.routes';
import notificationRoutes from '../modules/shared-endpoints/notification/routes/notification.routes';
import sendVerificationRoutes from '../modules/shared-endpoints/notification/routes/send-verification.routes';

// ── Rutas admin ────────────────────────────────────────────────────────────
import adminAuthSessionRoutes from '../modules/admin/kyc/iam/routes/admin-auth-session.routes';
import adminUserRoutes from '../modules/admin/kyc/iam/routes/admin-user.routes';
import adminRbacRoutes from '../modules/admin/kyc/iam/routes/admin-rbac.routes';
import adminPersonRoutes from '../modules/admin/kyc/person/routes/admin-person.routes';
import adminChangeLogRoutes from '../modules/admin/records/audit/routes/admin-change-log.routes';
import adminAuditLogRoutes from '../modules/admin/records/audit/routes/admin-audit-log.routes';
import adminAuditAlertRoutes from '../modules/admin/records/audit/routes/admin-audit-alert.routes';
import adminAuditActionCatalogRoutes from '../modules/admin/records/audit/routes/admin-audit-action-catalog.routes';
import adminSessionTraceRoutes from '../modules/admin/records/audit/routes/admin-session-trace.routes';
import adminNotificationTypeRoutes from '../modules/admin/notification/routes/admin-notification-type.routes';
import adminNotificationCategoryRoutes from '../modules/admin/notification/routes/admin-notification-category.routes';
import adminNotificationDeliveryRoutes from '../modules/admin/notification/routes/admin-notification-delivery.routes';
import adminPrivacyPolicyRoutes from '../modules/admin/records/legal/routes/privacy-policy-admin.routes';
import adminConsentTypeRoutes from '../modules/admin/records/legal/routes/consent-type.routes';
import adminUserConsentRoutes from '../modules/admin/records/legal/routes/admin-user-consent.routes';
import adminSystemGlobalConfigRoutes from '../modules/admin/core/routes/system-global-config.routes';
import adminPromotionalBannerRoutes from '../modules/admin/core/routes/promotional-banner.routes';
import adminApprovalRequestRoutes from '../modules/admin/core/routes/approval-request.routes';
import adminIntegrationMonitoringRoutes from '../modules/admin/integration/routes/integration-monitoring.routes';

// ── Rutas client ───────────────────────────────────────────────────────────
import authRegisterRoutes from '../modules/client/kyc/iam/routes/auth-register.routes';
import authBiometricRoutes from '../modules/client/kyc/iam/routes/auth-biometric.routes';
import emailBounceWebhookRoutes from '../modules/client/notification/webhook/routes/email-bounce-webhook.routes';
import personReferenceRoutes from '../modules/client/kyc/person/routes/person-reference.routes';
import userConsentRoutes from '../modules/client/records/legal/routes/user-consent.routes';
import userActivityRoutes from '../modules/client/records/audit/routes/user-activity.routes';
import promotionalBannerRoutes from '../modules/shared-endpoints/core/routes/promotional-banner.routes';

type Audience = 'admin' | 'client';

/** Router de una audiencia: marca req.serverContext (el login valida el rol contra ella) y monta su Swagger. */
function audienceRouter(audience: Audience) {
  const router = express.Router();
  router.use((req, _res, next) => {
    req.serverContext = audience;
    next();
  });
  (audience === 'admin' ? swaggerAdminDocs : swaggerClientDocs)(router);

  router.use('/api/v1/auth', authLoginRoutes);
  router.use('/api/v1/kyc', mfaRoutes);
  router.use('/api/v1/kyc', profileRoutes);
  router.use('/api/v1/kyc', notificationPreferenceRoutes);
  router.use('/api/v1/kyc', maintainersRoutes);
  router.use('/api/v1/notification', notificationRoutes);
  router.use('/api/v1/notification', sendVerificationRoutes);
  return router;
}

function adminRouter() {
  const router = audienceRouter('admin');
  router.use('/api/v1/auth', adminAuthSessionRoutes);
  router.use('/api/v1/kyc', adminPersonRoutes);
  router.use('/api/v1/kyc', adminUserRoutes);
  router.use('/api/v1/kyc', adminRbacRoutes);
  router.use('/api/v1/notification', adminNotificationTypeRoutes);
  router.use('/api/v1/notification', adminNotificationCategoryRoutes);
  router.use('/api/v1/notification', adminNotificationDeliveryRoutes);
  router.use('/api/v1/records', adminPrivacyPolicyRoutes);
  router.use('/api/v1/records', adminChangeLogRoutes);
  router.use('/api/v1/records', adminAuditLogRoutes);
  router.use('/api/v1/records', adminAuditAlertRoutes);
  router.use('/api/v1/records', adminAuditActionCatalogRoutes);
  router.use('/api/v1/records', adminSessionTraceRoutes);
  router.use('/api/v1/records', adminConsentTypeRoutes);
  router.use('/api/v1/records', adminUserConsentRoutes);
  router.use('/api/v1/core', adminSystemGlobalConfigRoutes);
  router.use('/api/v1/core', adminPromotionalBannerRoutes);
  router.use('/api/v1/core', adminApprovalRequestRoutes);
  router.use('/api/v1/integration', adminIntegrationMonitoringRoutes);
  return router;
}

function clientRouter() {
  const router = audienceRouter('client');
  router.use('/api/v1/auth', authRegisterRoutes);
  router.use('/api/v1/auth', authBiometricRoutes);
  router.use('/api/v1/notification', emailBounceWebhookRoutes);
  router.use('/api/v1/kyc', personReferenceRoutes);
  router.use('/api/v1/records', userConsentRoutes);
  router.use('/api/v1/records', userActivityRoutes);
  router.use('/api/v1/core', promotionalBannerRoutes);
  return router;
}

/** JSON malformado del cliente → 400 controlado (no INTERNAL_ERROR ni ruido de auditoría). */
function handleMalformedJson(err: unknown, req: Request, res: Response, next: NextFunction) {
  if ((err as { type?: string } | null)?.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      code: 'INVALID_JSON_BODY',
      message: 'El cuerpo de la solicitud contiene JSON inválido. Verifica la sintaxis y el Content-Type.',
      correlationId: req.correlationId ?? null
    });
  }
  return next(err);
}

type CheckStatus = 'healthy' | 'unhealthy' | 'degraded';

/** 200 si todo está bien, 503 si una dependencia crítica (la BD) no responde. Redis caído = degradado. */
async function health(req: Request, res: Response) {
  const checks: Record<string, { status: CheckStatus; responseTimeMs?: number; note?: string }> = {};

  const dbStart = Date.now();
  try {
    await databaseHealth.checkDatabase();
    checks.database = { status: 'healthy', responseTimeMs: Date.now() - dbStart };
  } catch {
    checks.database = { status: 'unhealthy', responseTimeMs: Date.now() - dbStart };
  }
  checks.redis = redisClient.isAvailable()
    ? { status: 'healthy' }
    : { status: 'degraded', note: 'running in single-instance mode' };

  const statuses = Object.values(checks).map(c => c.status);
  const status: CheckStatus = statuses.includes('unhealthy') ? 'unhealthy' : statuses.includes('degraded') ? 'degraded' : 'healthy';

  return res.status(status === 'unhealthy' ? 503 : 200).json({
    status,
    service: 'api',
    version,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId,
    checks
  });
}

function createApp() {
  const app = express();

  // Detrás del ALB: la IP real y el protocolo llegan en X-Forwarded-*
  app.set('trust proxy', 1);

  // ⚠️ El orden importa
  app.use(CorrelationMiddleware.addCorrelationId); // 1. Correlation ID (primero)
  app.use(SecurityMiddleware.helmet()); // 2. Seguridad
  app.use(SecurityMiddleware.cors());
  app.use(SecurityMiddleware.addSecurityHeaders);
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' })); // 3. Body parsers
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(handleMalformedJson);
  app.use(auditContextMiddleware); // 4. Contexto de la operación (necesita body + correlationId)
  app.use(compression());
  app.use(httpLogger); // 5. Log HTTP (necesita correlationId)

  app.get('/health', health);
  app.get('/', (req, res) =>
    res.status(200).json({
      success: true,
      service: 'api',
      message: 'Base Project API',
      version,
      endpoints: { admin: '/admin', client: '/client', health: '/health' },
      docs: { admin: '/admin/docs', client: '/client/docs' },
      correlationId: req.correlationId
    })
  );

  app.use('/admin', adminRouter());
  app.use('/client', clientRouter());

  app.use(ErrorMiddleware.handleNotFound);
  app.use(ErrorMiddleware.handleError);
  return app;
}

export default createApp();
