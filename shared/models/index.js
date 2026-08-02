const { Sequelize } = require('sequelize');
const sequelize = require('../../config/config');

const db = {
  sequelize,
  Sequelize
};

// ============================================================================
// MODELOS DE UBICACIÓN Y GEOGRAFÍA
// ============================================================================
db.Country = require('../../modules/schemas/kyc/maintainers/models/country.model')(sequelize);
db.Department = require('../../modules/schemas/kyc/maintainers/models/department.model')(sequelize);
db.City = require('../../modules/schemas/kyc/maintainers/models/city.model')(sequelize);
db.PhonePrefix = require('../../modules/schemas/kyc/maintainers/models/phone-prefix.model')(sequelize);

// ============================================================================
// MODELOS DE CATÁLOGOS Y CONFIGURACIÓN
// ============================================================================
db.Gender = require('../../modules/schemas/kyc/maintainers/models/gender.model')(sequelize);
db.Role = require('../../modules/schemas/kyc/iam/models/role.model')(sequelize);
db.RolePermissionOverride = require('../../modules/schemas/kyc/iam/models/role-permission-override.model')(sequelize);
db.AvatarTheme = require('../../modules/schemas/kyc/maintainers/models/avatar-theme.model')(sequelize);
db.Avatar = require('../../modules/schemas/kyc/maintainers/models/avatar.model')(sequelize);
db.PrivacyPolicy = require('../../modules/schemas/records/legal/models/privacy-policy.model')(sequelize);
db.DocumentType = require('../../modules/schemas/kyc/maintainers/models/document-type.model')(sequelize);

// ============================================================================
// MODELOS DE PERSONAS Y USUARIOS
// ============================================================================
db.Person = require('../../modules/schemas/kyc/person/models/person.model')(sequelize);
db.PersonContact = require('../../modules/schemas/kyc/person/models/person-contact.model')(sequelize);
db.PersonLocation = require('../../modules/schemas/kyc/person/models/person-location.model')(sequelize);
db.PersonReference = require('../../modules/schemas/kyc/person/models/person-reference.model')(sequelize);
db.User = require('../../modules/schemas/kyc/iam/models/user.model')(sequelize);

// ============================================================================
// MODELOS DE AUTENTICACIÓN Y SEGURIDAD
// ============================================================================
db.VerificationCode = require('../../modules/schemas/notification/models/verification-code.model')(sequelize);
db.UserLoginAttempt = require('../../modules/schemas/records/audit/models/user-login-attempt.model')(sequelize);
db.UserSession = require('../../modules/schemas/kyc/iam/models/user-session.model')(sequelize);
db.ResetCredentials = require('../../modules/schemas/kyc/iam/models/reset-credentials.model')(sequelize);
db.UserTrustedDevice = require('../../modules/schemas/kyc/iam/models/user-trusted-device.model')(sequelize);
const {
  UserBiometricCredentialModel,
  BiometricChallengeModel
} = require('../../modules/schemas/kyc/iam/models/biometric.models');
db.UserBiometricCredential = UserBiometricCredentialModel(sequelize);
db.BiometricChallenge = BiometricChallengeModel(sequelize);

// ============================================================================
// LOGS
// ============================================================================
db.UserChangeLog = require('../../modules/schemas/records/audit/models/user-change-log.model')(sequelize);

// ============================================================================
// MODELOS DE NOTIFICACIONES
// ============================================================================
db.NotificationCategory = require('../../modules/schemas/notification/models/notification-category.model')(sequelize);
db.NotificationType = require('../../modules/schemas/notification/models/notification-type.model')(sequelize);
db.UserNotificationPreference = require('../../modules/schemas/kyc/person/models/user-notification-preference.model')(sequelize);
db.Notification = require('../../modules/schemas/notification/models/notification.model')(sequelize);
db.GlobalNotification = require('../../modules/schemas/notification/models/global-notification.model')(sequelize);
db.GlobalNotificationRead = require('../../modules/schemas/notification/models/global-notification-read.model')(sequelize);
db.UserPushToken = require('../../modules/schemas/notification/models/user-push-token.model')(sequelize);
db.SmsDeliveryAttempt = require('../../modules/schemas/notification/models/sms-delivery-attempt.model')(sequelize);
db.EmailBounceSuppression = require('../../modules/schemas/notification/models/email-bounce-suppression.model')(sequelize);

// ============================================================================
// MONITOREO DE INTEGRACIONES EXTERNAS (solo AWS)
// ============================================================================
db.IntegrationApiLog = require('../../modules/schemas/integration/models/integration-api-log.model')(sequelize);
db.ProviderFallbackEvent = require('../../modules/schemas/integration/models/provider-fallback-event.model')(sequelize);

// ============================================================================
// CONFIGURACIÓN GLOBAL DEL SISTEMA
// ============================================================================
db.SystemGlobalConfig = require('../../modules/schemas/core/models/system-global-config.model')(sequelize);

// ============================================================================
// DOBLE APROBACIÓN GLOBAL (maker-checker)
// ============================================================================
db.ApprovalRequest = require('../../modules/schemas/core/models/approval-request.model')(sequelize);

// ============================================================================
// AUDIT
// ============================================================================
db.AuditLog = require('../../modules/schemas/records/audit/models/audit-log.model')(sequelize);
db.AuditAlert = require('../../modules/schemas/records/audit/models/audit-alert.model')(sequelize);

// ============================================================================
// CONSENTIMIENTOS
// ============================================================================
db.ConsentType = require('../../modules/schemas/records/legal/models/consent-type.model')(sequelize);
db.UserConsent = require('../../modules/schemas/records/legal/models/user-consent.model')(sequelize);

// ============================================================================
// CONFIGURACIÓN DE ASOCIACIONES
// ============================================================================
for (const modelName of Object.keys(db)) {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
}

// ============================================================================
// TRAZABILIDAD DE SESIÓN — hook central de origin_session_id
// ============================================================================
// Estampa origin_session_id/origin_correlation_id al CREAR, en cualquier modelo que declare esas
// columnas, leyéndolos del contexto de request (AsyncLocalStorage). Registrado a nivel del sequelize
// para que las tablas nuevas lo hereden sin código repetido en cada repositorio. Un valor explícito
// del call-site siempre gana; null en workers/flujos sin sesión. Ver mixins/origin-session.mixin.js.
const { stampOriginSession } = require('./mixins/origin-session.mixin');

sequelize.addHook('beforeCreate', stampOriginSession);
sequelize.addHook('beforeBulkCreate', instances => {
  // bulkCreate NO dispara beforeCreate por fila (salvo individualHooks); estampamos aquí cada una.
  for (const instance of instances) {
    stampOriginSession(instance);
  }
});

module.exports = db;
