// modules/admin/app.ts
import BaseApp from '../../shared/base/base.app';
import swaggerClientDocs from '../../config/swagger.admin';

// ── Shared routes ──────────────────────────────────────────────────────────
import sharedAuthRoutes from '../shared-endpoints/kyc/iam/routes/auth-login.routes';
import sharedMaintainersRoutes from '../shared-endpoints/kyc/maintainers/routes/maintainers.routes';
import sharedMfaRoutes from '../shared-endpoints/kyc/iam/routes/mfa.routes';
import notificationPreferenceRoutes from '../shared-endpoints/kyc/person/routes/notification-preference.routes';
import sharedProfileRoutes from '../shared-endpoints/kyc/person/routes/profile.routes';
import notificationRoutes from '../shared-endpoints/notification/routes/notification.routes';
import sendVerificationRoutes from '../shared-endpoints/notification/routes/send-verification.routes';

// ── Admin — Auth Sessions ──────────────────────────────────────────────────
import adminAuthSessionRoutes from './kyc/iam/routes/admin-auth-session.routes';

// ── Admin — Privacy & Policy ───────────────────────────────────────────────
import privacyPolicyAdminRoutes from './records/legal/routes/privacy-policy-admin.routes';

// ── Admin — KYC (person) ───────────────────────────────────────────────────
import personAdminRoutes from './kyc/person/routes/admin-person.routes';
import changeLogAdminRoutes from './records/audit/routes/admin-change-log.routes';
import notificationTypeAdminRoutes from './notification/routes/admin-notification-type.routes';
import notificationCategoryAdminRoutes from './notification/routes/admin-notification-category.routes';

// ── Admin — Usuarios internos & RBAC ──────────────────────────────────────
import adminUserRoutes from './kyc/iam/routes/admin-user.routes';
import adminRbacRoutes from './kyc/iam/routes/admin-rbac.routes';

// ── Admin — Auditoría ──────────────────────────────────────────────────────
import adminAuditLogRoutes from './records/audit/routes/admin-audit-log.routes';
import adminAuditAlertRoutes from './records/audit/routes/admin-audit-alert.routes';
import adminAuditActionCatalogRoutes from './records/audit/routes/admin-audit-action-catalog.routes';
import adminSessionTraceRoutes from './records/audit/routes/admin-session-trace.routes';

// ── Admin — Entregas de notificaciones (email/push delivery) ───────────────
import adminNotificationDeliveryRoutes from './notification/routes/admin-notification-delivery.routes';

// ── Admin — Consentimientos ────────────────────────────────────────────────
import consentTypeAdminRoutes from './records/legal/routes/consent-type.routes';
import adminUserConsentRoutes from './records/legal/routes/admin-user-consent.routes';

// ── Admin — Configuración global (SystemGlobalConfig) ─────────────────────
import systemGlobalConfigRoutes from './core/routes/system-global-config.routes';

// ── Admin — Banners promocionales ─────────────────────────────────────────
import promotionalBannerAdminRoutes from './core/routes/promotional-banner.routes';

// ── Admin — Doble aprobación global (maker-checker) ───────────────────────
import approvalRequestRoutes from './core/routes/approval-request.routes';

// ── Admin — Monitoreo de integraciones externas (solo AWS) ────────────────
import integrationMonitoringRoutes from './integration/routes/integration-monitoring.routes';

class AdminApp extends BaseApp {
  constructor() {
    super('admin');
  }

  override setupSwagger() {
    swaggerClientDocs(this.app);
  }

  override setupRoutes() {
    // ── Shared ──────────────────────────────────────────────────────────────
    this.app.use(
      '/api/v1/auth',
      (req, _, next) => {
        req.serverContext = 'admin';
        next();
      },
      sharedAuthRoutes
    );

    // shared endpoints (dominio en app.js; subdominio dentro del route)
    this.app.use('/api/v1/kyc', sharedMfaRoutes);
    this.app.use('/api/v1/kyc', sharedProfileRoutes);
    this.app.use('/api/v1/kyc', notificationPreferenceRoutes);
    this.app.use('/api/v1/kyc', sharedMaintainersRoutes);
    this.app.use('/api/v1/notification', notificationRoutes);
    this.app.use('/api/v1/notification', sendVerificationRoutes);

    // ── Auth Sessions ───────────────────────────────────────────────────────
    this.app.use('/api/v1/auth', adminAuthSessionRoutes);

    // ── Privacy & Policy ────────────────────────────────────────────────────
    this.app.use('/api/v1/records', privacyPolicyAdminRoutes);

    // ── KYC — Admin ─────────────────────────────────────────────────────────
    this.app.use('/api/v1/kyc', personAdminRoutes);
    this.app.use('/api/v1/records', changeLogAdminRoutes);
    this.app.use('/api/v1/notification', notificationTypeAdminRoutes);
    this.app.use('/api/v1/notification', notificationCategoryAdminRoutes);

    // ── Usuarios internos & RBAC ──────────────────────────────────────────────
    this.app.use('/api/v1/kyc', adminUserRoutes);
    this.app.use('/api/v1/kyc', adminRbacRoutes);

    // ── Auditoría ──────────────────────────────────────────────────────────
    this.app.use('/api/v1/records', adminAuditLogRoutes);
    this.app.use('/api/v1/records', adminAuditAlertRoutes);
    this.app.use('/api/v1/records', adminAuditActionCatalogRoutes);
    this.app.use('/api/v1/records', adminSessionTraceRoutes);

    // ── Entregas de notificaciones ──────────────────────────────────────────
    this.app.use('/api/v1/notification', adminNotificationDeliveryRoutes);

    // ── Consentimientos ────────────────────────────────────────────────────
    this.app.use('/api/v1/records', consentTypeAdminRoutes);
    this.app.use('/api/v1/records', adminUserConsentRoutes);

    // ── Configuración global ────────────────────────────────────────────────
    this.app.use('/api/v1/core', systemGlobalConfigRoutes);

    // ── Banners promocionales ───────────────────────────────────────────────
    this.app.use('/api/v1/core', promotionalBannerAdminRoutes);

    // ── Doble aprobación global (maker-checker) ─────────────────────────────
    this.app.use('/api/v1/core', approvalRequestRoutes);

    // ── Monitoreo de integraciones externas (solo AWS) ──────────────────────
    this.app.use('/api/v1/integration', integrationMonitoringRoutes);
  }
}

export default new AdminApp().getApp();
