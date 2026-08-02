// config/swagger.admin.js

const swaggerUi = require('swagger-ui-express');
const getAllSchemas = require('./swagger/schemas');
const { server } = require('../shared/constants');

// ─── Módulos KYC (compartidos con client) ─────────────────────
const authLoginPaths = require('./swagger/modules/shared-endpoints/kyc/iam/auth-login.paths');
const catalogPaths = require('./swagger/modules/shared-endpoints/kyc/maintainers/maintainers.paths');
const profilePaths = require('./swagger/modules/shared-endpoints/kyc/person/profile.paths');
const mfaPaths = require('./swagger/modules/shared-endpoints/kyc/iam/mfa.paths');

// ─── Módulos Notification (compartidos con client) ────────────
const notificationSharedPaths = require('./swagger/modules/shared-endpoints/notification/notification.paths');
const notificationPreferencePaths = require('./swagger/modules/shared-endpoints/kyc/person/notification-preference.paths');
const sendVerificationPaths = require('./swagger/modules/shared-endpoints/notification/send-verification.paths');

// ─── Módulos Admin — Privacidad ───────────────────────────────
const privacyPolicyPaths = require('./swagger/modules/admin/records/legal/privacy-policy-admin.paths');

// ─── Módulos Admin — KYC ──────────────────────────────────────
const personPaths = require('./swagger/modules/admin/kyc/person/person.paths');
const notificationTypePaths = require('./swagger/modules/admin/notification/notification-type.paths');

// ─── Módulos Admin — Auditoría ────────────────────────────────
const adminAuthSessionPaths = require('./swagger/modules/admin/kyc/iam/admin-auth-session.paths');
const changeLogPaths = require('./swagger/modules/admin/records/audit/change-log.paths');
const auditLogPaths = require('./swagger/modules/admin/records/audit/audit-log.paths');
const auditAlertPaths = require('./swagger/modules/admin/records/audit/audit-alert.paths');
const auditActionCatalogPaths = require('./swagger/modules/admin/records/audit/audit-action-catalog.paths');
const sessionTracePaths = require('./swagger/modules/admin/records/audit/session-trace.paths');
const notificationDeliveryPaths = require('./swagger/modules/admin/notification/notification-delivery.paths');

// ─── Módulos Admin — Consentimientos ──────────────────────────
const consentTypePaths = require('./swagger/modules/admin/records/legal/consent-type.paths');
const userConsentAuditPaths = require('./swagger/modules/admin/records/legal/user-consent.paths');

// ─── Módulos Admin — Configuración global ─────────────────────
const systemGlobalConfigPaths = require('./swagger/modules/admin/core/system-global-config.paths');

// ─── Módulos Admin — Banners promocionales ────────────────────
const promotionalBannerAdminPaths = require('./swagger/modules/admin/core/promotional-banner.paths');

// ─── Módulos Admin — Usuarios internos & RBAC ─────────────────
const adminUserPaths = require('./swagger/modules/admin/kyc/iam/admin-user.paths');
const adminRbacPaths = require('./swagger/modules/admin/kyc/iam/admin-rbac.paths');

// ─── Módulos Admin — Doble aprobación global (maker-checker) ──
const approvalRequestPaths = require('./swagger/modules/admin/core/approval-request.paths');

// ─── Merge paths ──────────────────────────────────────────────

const allPaths = {
  ...authLoginPaths.paths,
  ...catalogPaths.paths,
  ...profilePaths.paths,
  ...mfaPaths.paths,
  ...notificationSharedPaths.paths,
  ...notificationPreferencePaths.paths,
  ...sendVerificationPaths.paths,
  ...privacyPolicyPaths.paths,
  ...personPaths.paths,
  ...notificationTypePaths.paths,
  ...adminAuthSessionPaths.paths,
  ...changeLogPaths.paths,
  ...auditLogPaths.paths,
  ...auditAlertPaths.paths,
  ...auditActionCatalogPaths.paths,
  ...sessionTracePaths.paths,
  ...notificationDeliveryPaths.paths,
  ...consentTypePaths.paths,
  ...userConsentAuditPaths.paths,
  ...systemGlobalConfigPaths.paths,
  ...promotionalBannerAdminPaths.paths,
  ...adminUserPaths.paths,
  ...adminRbacPaths.paths,
  ...approvalRequestPaths.paths
};

// ─── Merge schemas ─────────────────────────────────────────────

const allModuleSchemas = {
  ...authLoginPaths.schemas,
  ...catalogPaths.schemas,
  ...profilePaths.schemas,
  ...mfaPaths.schemas,
  ...notificationSharedPaths.schemas,
  ...notificationPreferencePaths.schemas,
  ...sendVerificationPaths.schemas,
  ...privacyPolicyPaths.schemas,
  ...personPaths.schemas,
  ...notificationTypePaths.schemas,
  ...adminAuthSessionPaths.schemas,
  ...changeLogPaths.schemas,
  ...consentTypePaths.schemas,
  ...userConsentAuditPaths.schemas,
  ...auditLogPaths.schemas,
  ...auditAlertPaths.schemas,
  ...auditActionCatalogPaths.schemas,
  ...sessionTracePaths.schemas,
  ...notificationDeliveryPaths.schemas,
  ...systemGlobalConfigPaths.schemas,
  ...promotionalBannerAdminPaths.schemas,
  ...adminUserPaths.schemas,
  ...adminRbacPaths.schemas,
  ...approvalRequestPaths.schemas
};

// ─── Ensamblador ──────────────────────────────────────────────

const swaggerAdminDocs = app => {
  const { port: PORT, nodeEnv: NODE_ENV, host: HOST } = server;

  const servers =
    NODE_ENV === 'production'
      ? [{ url: 'https://example.com/admin', description: 'Producción - Admin API' }]
      : [{ url: `http://${HOST}:${PORT}/admin`, description: 'Desarrollo - Admin API' }];

  const swaggerSpec = {
    openapi: '3.0.0',
    info: {
      title: 'Base Project - Admin API',
      version: '1.0.0',
      description: `
## Documentación de la API de Administración

Esta API permite a los administradores (\`admin\` / \`super_admin\`):
- 🔐 Autenticarse y gestionar sesión
- 👥 Gestionar personas y perfiles
- 🔔 Administrar tipos de notificación y enviar notificaciones globales
- 📋 Consultar bitácora de cambios
- 🔍 Consultar y exportar logs de auditoría (CSV/XLSX) — solo lectura, append-only
- 🧭 Trazabilidad por sesión (qué hizo cada usuario en cada sesión)
- 🔔 Gestionar alertas de auditoría
- 📄 Publicar versiones de la política de privacidad
- 👔 Gestionar usuarios internos (crear, asignar rol, activar/desactivar)
- 🔑 Administrar permisos RBAC en runtime
- ✅ Doble aprobación global (maker-checker)

⚠️ **Nota:** Todos los endpoints requieren autenticación. Los endpoints de gestión de usuarios y RBAC requieren permiso sobre el módulo \`ADMIN\`.
      `.trim(),
      contact: { name: 'Soporte Admin', email: 'admin@example.com' },
      license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' }
    },
    servers,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access Token. Header: `Authorization: Bearer <accessToken>`'
        },
        idTokenAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-id-token',
          description: 'ID Token con custom attributes. **Requerido en todos los endpoints autenticados.**'
        },
        timestampAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-timestamp',
          description: 'Timestamp para prevenir replay attacks. **Solo requerido en producción** (ventana de 10 segundos).'
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'API Key para servicios externos. Usada en `POST /notifications`. No requiere JWT.'
        }
      },
      schemas: { ...getAllSchemas, ...allModuleSchemas }
    },
    security: [{ bearerAuth: [] }, { idTokenAuth: [] }, { timestampAuth: [] }],
    paths: allPaths
  };

  const swaggerUiOptions = {
    explorer: true,
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info { margin: 20px 0; }
      .swagger-ui .scheme-container { margin: 20px 0; }
      .swagger-ui .info .title { color: #d32f2f; }
    `,
    customSiteTitle: 'Admin API',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'list',
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      syntaxHighlight: { activate: true, theme: 'monokai' }
    }
  };

  // 1. HTML con el spec embebido
  app.get('/docs', (req, res) => {
    res.send(swaggerUi.generateHTML(swaggerSpec, swaggerUiOptions));
  });

  // 2. Assets estáticos atados a este spec
  app.use('/', swaggerUi.serveFiles(swaggerSpec, swaggerUiOptions));

  // 3. JSON del spec
  app.get('/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log(`📚 [ADMIN] Swagger Docs: http://${HOST}:${PORT}/admin/docs`);
};

module.exports = swaggerAdminDocs;
