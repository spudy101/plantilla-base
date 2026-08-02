// modules/client/app.js
const BaseApp = require('../../shared/base/base.app');
const swaggerClientDocs = require('../../config/swagger.client');

// ── Shared routes ──────────────────────────────────────────────────────────
const sharedAuthRoutes = require('../shared-endpoints/kyc/iam/routes/auth-login.routes');
const sharedMaintainersRoutes = require('../shared-endpoints/kyc/maintainers/routes/maintainers.routes');
const sharedMfaRoutes = require('../shared-endpoints/kyc/iam/routes/mfa.routes');
const sharedProfileRoutes = require('../shared-endpoints/kyc/person/routes/profile.routes');
const notificationRoutes = require('../shared-endpoints/notification/routes/notification.routes');
const notificationPreferenceRoutes = require('../shared-endpoints/kyc/person/routes/notification-preference.routes');

// ── Auth ───────────────────────────────────────────────────────────────────
const clientAuthRoutes = require('./kyc/iam/routes/auth-register.routes');
const authBiometricRoutes = require('./kyc/iam/routes/auth-biometric.routes');

// ── Verification ───────────────────────────────────────────────────────────
const sendVerificationRoutes = require('../shared-endpoints/notification/routes/send-verification.routes');

// ── Webhook inbound de bounces de SES (vía SNS) ───────────────────────────
const emailBounceWebhookRoutes = require('./notification/webhook/routes/email-bounce-webhook.routes');

// ── KYC — Client ───────────────────────────────────────────────────────────
const personReferenceRoutes = require('./kyc/person/routes/person-reference.routes');

// ── Consentimientos ────────────────────────────────────────────────────────
const userConsentRoutes = require('./records/legal/routes/user-consent.routes');

// ── Actividad reciente del usuario (feed client-safe) ─────────────────────
const userActivityRoutes = require('./records/audit/routes/user-activity.routes');

// ── Banners promocionales (público: landing + app cliente) ────────────────
const promotionalBannerRoutes = require('../shared-endpoints/core/routes/promotional-banner.routes');

class ClientApp extends BaseApp {
  constructor() {
    super('client');
  }

  setupSwagger() {
    swaggerClientDocs(this.app);
  }

  setupRoutes() {
    // ── Shared ────────────────────────────────────────────────────────────
    this.app.use(
      '/api/v1/auth',
      (req, _, next) => {
        req.serverContext = 'client';
        next();
      },
      sharedAuthRoutes
    );
    // shared endpoints (dominio en app.js; subdominio dentro del route)
    this.app.use('/api/v1/kyc', sharedMfaRoutes);
    this.app.use('/api/v1/kyc', sharedProfileRoutes);
    this.app.use('/api/v1/kyc', sharedMaintainersRoutes);
    this.app.use('/api/v1/notification', notificationRoutes);
    this.app.use('/api/v1/kyc', notificationPreferenceRoutes);

    // ── Auth (grupo lógico: todo el flujo de autenticación bajo /auth) ─────
    this.app.use('/api/v1/auth', clientAuthRoutes);
    this.app.use('/api/v1/auth', authBiometricRoutes);

    // ── Verification ──────────────────────────────────────────────────────
    this.app.use('/api/v1/notification', sendVerificationRoutes);
    this.app.use('/api/v1/notification', emailBounceWebhookRoutes);

    // ── KYC — Client ──────────────────────────────────────────────────────
    this.app.use('/api/v1/kyc', personReferenceRoutes);

    // ── Consentimientos ───────────────────────────────────────────────────
    this.app.use('/api/v1/records', userConsentRoutes);

    // ── Actividad reciente del usuario ────────────────────────────────────
    this.app.use('/api/v1/records', userActivityRoutes);

    // ── Banners promocionales (público, dominio core sin subdominio) ──────
    this.app.use('/api/v1/core', promotionalBannerRoutes);
  }
}

module.exports = new ClientApp().getApp();
