// modules/admin/app.js
const BaseApp = require('../../shared/base/base.app');
const swaggerClientDocs = require('../../config/swagger.admin');

// ── Shared routes ──────────────────────────────────────────────────────────
const sharedAuthRoutes = require('../shared-endpoints/kyc/iam/routes/auth-login.routes');
const sharedMaintainersRoutes = require('../shared-endpoints/kyc/maintainers/routes/maintainers.routes');
const sharedMfaRoutes = require('../shared-endpoints/kyc/iam/routes/mfa.routes');
const notificationPreferenceRoutes = require('../shared-endpoints/kyc/person/routes/notification-preference.routes');
const sharedProfileRoutes = require('../shared-endpoints/kyc/person/routes/profile.routes');
const notificationRoutes = require('../shared-endpoints/notification/routes/notification.routes');
const sendVerificationRoutes = require('../shared-endpoints/notification/routes/send-verification.routes');

// ── Admin — Auth Sessions ──────────────────────────────────────────────────
const adminAuthSessionRoutes = require('./kyc/iam/routes/admin-auth-session.routes');

// ── Admin — Privacy & Policy ───────────────────────────────────────────────
const privacyPolicyAdminRoutes = require('./records/legal/routes/privacy-policy-admin.routes');

// ── Admin — KYC (person) ───────────────────────────────────────────────────
const personAdminRoutes = require('./kyc/person/routes/admin-person.routes');
const changeLogAdminRoutes = require('./records/audit/routes/admin-change-log.routes');
const notificationTypeAdminRoutes = require('./notification/routes/admin-notification-type.routes');
const notificationCategoryAdminRoutes = require('./notification/routes/admin-notification-category.routes');

// ── Admin — Usuarios internos & RBAC ──────────────────────────────────────
const adminUserRoutes = require('./kyc/iam/routes/admin-user.routes');
const adminRbacRoutes = require('./kyc/iam/routes/admin-rbac.routes');

// ── Admin — Auditoría ──────────────────────────────────────────────────────
const adminAuditLogRoutes = require('./records/audit/routes/admin-audit-log.routes');
const adminAuditAlertRoutes = require('./records/audit/routes/admin-audit-alert.routes');
const adminAuditActionCatalogRoutes = require('./records/audit/routes/admin-audit-action-catalog.routes');
const adminSessionTraceRoutes = require('./records/audit/routes/admin-session-trace.routes');

// ── Admin — Entregas de notificaciones (email/push delivery) ───────────────
const adminNotificationDeliveryRoutes = require('./notification/routes/admin-notification-delivery.routes');

// ── Admin — Consentimientos ────────────────────────────────────────────────
const consentTypeAdminRoutes = require('./records/legal/routes/consent-type.routes');
const adminUserConsentRoutes = require('./records/legal/routes/admin-user-consent.routes');

// ── Admin — Configuración global (SystemGlobalConfig) ─────────────────────
const systemGlobalConfigRoutes = require('./core/routes/system-global-config.routes');

// ── Admin — Banners promocionales ─────────────────────────────────────────
const promotionalBannerAdminRoutes = require('./core/routes/promotional-banner.routes');

// ── Admin — Doble aprobación global (maker-checker) ───────────────────────
const approvalRequestRoutes = require('./core/routes/approval-request.routes');

// ── Admin — Monitoreo de integraciones externas (solo AWS) ────────────────
const integrationMonitoringRoutes = require('./integration/routes/integration-monitoring.routes');

class AdminApp extends BaseApp {
  constructor() {
    super('admin');
  }

  setupSwagger() {
    swaggerClientDocs(this.app);
  }

  setupRoutes() {
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

module.exports = new AdminApp().getApp();
