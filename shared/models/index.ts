import { Sequelize } from 'sequelize';
import sequelize from '../../config/config';
import type { Model } from 'sequelize';
import type { ModelRegistry } from './registry';
import defineCountry from '../../modules/schemas/kyc/maintainers/models/country.model';
import defineDepartment from '../../modules/schemas/kyc/maintainers/models/department.model';
import defineCity from '../../modules/schemas/kyc/maintainers/models/city.model';
import definePhonePrefix from '../../modules/schemas/kyc/maintainers/models/phone-prefix.model';
import defineGender from '../../modules/schemas/kyc/maintainers/models/gender.model';
import defineRole from '../../modules/schemas/kyc/iam/models/role.model';
import defineRolePermissionOverride from '../../modules/schemas/kyc/iam/models/role-permission-override.model';
import defineAvatarTheme from '../../modules/schemas/kyc/maintainers/models/avatar-theme.model';
import defineAvatar from '../../modules/schemas/kyc/maintainers/models/avatar.model';
import definePrivacyPolicy from '../../modules/schemas/records/legal/models/privacy-policy.model';
import defineDocumentType from '../../modules/schemas/kyc/maintainers/models/document-type.model';
import definePerson from '../../modules/schemas/kyc/person/models/person.model';
import definePersonContact from '../../modules/schemas/kyc/person/models/person-contact.model';
import definePersonLocation from '../../modules/schemas/kyc/person/models/person-location.model';
import definePersonReference from '../../modules/schemas/kyc/person/models/person-reference.model';
import defineUser from '../../modules/schemas/kyc/iam/models/user.model';
import defineVerificationCode from '../../modules/schemas/notification/models/verification-code.model';
import defineUserLoginAttempt from '../../modules/schemas/records/audit/models/user-login-attempt.model';
import defineUserSession from '../../modules/schemas/kyc/iam/models/user-session.model';
import defineResetCredentials from '../../modules/schemas/kyc/iam/models/reset-credentials.model';
import defineUserTrustedDevice from '../../modules/schemas/kyc/iam/models/user-trusted-device.model';
import defineUserBiometricCredential from '../../modules/schemas/kyc/iam/models/user-biometric-credential.model';
import defineBiometricChallenge from '../../modules/schemas/kyc/iam/models/biometric-challenge.model';
import defineUserChangeLog from '../../modules/schemas/records/audit/models/user-change-log.model';
import defineNotificationCategory from '../../modules/schemas/notification/models/notification-category.model';
import defineNotificationType from '../../modules/schemas/notification/models/notification-type.model';
import defineUserNotificationPreference from '../../modules/schemas/kyc/person/models/user-notification-preference.model';
import defineNotification from '../../modules/schemas/notification/models/notification.model';
import defineGlobalNotification from '../../modules/schemas/notification/models/global-notification.model';
import defineGlobalNotificationRead from '../../modules/schemas/notification/models/global-notification-read.model';
import defineUserPushToken from '../../modules/schemas/notification/models/user-push-token.model';
import defineSmsDeliveryAttempt from '../../modules/schemas/notification/models/sms-delivery-attempt.model';
import defineEmailBounceSuppression from '../../modules/schemas/notification/models/email-bounce-suppression.model';
import defineIntegrationApiLog from '../../modules/schemas/integration/models/integration-api-log.model';
import defineProviderFallbackEvent from '../../modules/schemas/integration/models/provider-fallback-event.model';
import defineSystemGlobalConfig from '../../modules/schemas/core/models/system-global-config.model';
import defineApprovalRequest from '../../modules/schemas/core/models/approval-request.model';
import defineAuditLog from '../../modules/schemas/records/audit/models/audit-log.model';
import defineAuditAlert from '../../modules/schemas/records/audit/models/audit-alert.model';
import defineConsentType from '../../modules/schemas/records/legal/models/consent-type.model';
import defineUserConsent from '../../modules/schemas/records/legal/models/user-consent.model';

// Registro tipado (tipos en registry.ts). Se respeta el orden de definición; las asociaciones se
// arman después, cuando todos los modelos existen.
const db: ModelRegistry = {
  sequelize,
  Sequelize,

  // ============================================================================
  // MODELOS DE UBICACIÓN Y GEOGRAFÍA
  // ============================================================================
  Country: defineCountry(sequelize),
  Department: defineDepartment(sequelize),
  City: defineCity(sequelize),
  PhonePrefix: definePhonePrefix(sequelize),

  // ============================================================================
  // MODELOS DE CATÁLOGOS Y CONFIGURACIÓN
  // ============================================================================
  Gender: defineGender(sequelize),
  Role: defineRole(sequelize),
  RolePermissionOverride: defineRolePermissionOverride(sequelize),
  AvatarTheme: defineAvatarTheme(sequelize),
  Avatar: defineAvatar(sequelize),
  PrivacyPolicy: definePrivacyPolicy(sequelize),
  DocumentType: defineDocumentType(sequelize),

  // ============================================================================
  // MODELOS DE PERSONAS Y USUARIOS
  // ============================================================================
  Person: definePerson(sequelize),
  PersonContact: definePersonContact(sequelize),
  PersonLocation: definePersonLocation(sequelize),
  PersonReference: definePersonReference(sequelize),
  User: defineUser(sequelize),

  // ============================================================================
  // MODELOS DE AUTENTICACIÓN Y SEGURIDAD
  // ============================================================================
  VerificationCode: defineVerificationCode(sequelize),
  UserLoginAttempt: defineUserLoginAttempt(sequelize),
  UserSession: defineUserSession(sequelize),
  ResetCredentials: defineResetCredentials(sequelize),
  UserTrustedDevice: defineUserTrustedDevice(sequelize),
  UserBiometricCredential: defineUserBiometricCredential(sequelize),
  BiometricChallenge: defineBiometricChallenge(sequelize),

  // ============================================================================
  // LOGS
  // ============================================================================
  UserChangeLog: defineUserChangeLog(sequelize),

  // ============================================================================
  // MODELOS DE NOTIFICACIONES
  // ============================================================================
  NotificationCategory: defineNotificationCategory(sequelize),
  NotificationType: defineNotificationType(sequelize),
  UserNotificationPreference: defineUserNotificationPreference(sequelize),
  Notification: defineNotification(sequelize),
  GlobalNotification: defineGlobalNotification(sequelize),
  GlobalNotificationRead: defineGlobalNotificationRead(sequelize),
  UserPushToken: defineUserPushToken(sequelize),
  SmsDeliveryAttempt: defineSmsDeliveryAttempt(sequelize),
  EmailBounceSuppression: defineEmailBounceSuppression(sequelize),

  // ============================================================================
  // MONITOREO DE INTEGRACIONES EXTERNAS (solo AWS)
  // ============================================================================
  IntegrationApiLog: defineIntegrationApiLog(sequelize),
  ProviderFallbackEvent: defineProviderFallbackEvent(sequelize),

  // ============================================================================
  // CONFIGURACIÓN GLOBAL DEL SISTEMA
  // ============================================================================
  SystemGlobalConfig: defineSystemGlobalConfig(sequelize),

  // ============================================================================
  // DOBLE APROBACIÓN GLOBAL (maker-checker)
  // ============================================================================
  ApprovalRequest: defineApprovalRequest(sequelize),

  // ============================================================================
  // AUDIT
  // ============================================================================
  AuditLog: defineAuditLog(sequelize),
  AuditAlert: defineAuditAlert(sequelize),

  // ============================================================================
  // CONSENTIMIENTOS
  // ============================================================================
  ConsentType: defineConsentType(sequelize),
  UserConsent: defineUserConsent(sequelize)
};

// ============================================================================
// CONFIGURACIÓN DE ASOCIACIONES
// ============================================================================
for (const entry of Object.values(db) as Array<{ associate?: (models: ModelRegistry) => void }>) {
  if (typeof entry.associate === 'function') {
    entry.associate(db);
  }
}

// ============================================================================
// TRAZABILIDAD DE SESIÓN — hook central de origin_session_id
// ============================================================================
// Estampa origin_session_id/origin_correlation_id al CREAR, en cualquier modelo que declare esas
// columnas, leyéndolos del contexto de request (AsyncLocalStorage). Registrado a nivel del sequelize
// para que las tablas nuevas lo hereden sin código repetido en cada repositorio. Un valor explícito
// del call-site siempre gana; null en workers/flujos sin sesión. Ver mixins/origin-session.mixin.js.
import originSessionMixinModule from './mixins/origin-session.mixin';
const { stampOriginSession } = originSessionMixinModule;

sequelize.addHook('beforeCreate', stampOriginSession);
sequelize.addHook('beforeBulkCreate', (instances: Model[]) => {
  // bulkCreate NO dispara beforeCreate por fila (salvo individualHooks); estampamos aquí cada una.
  for (const instance of instances) {
    stampOriginSession(instance);
  }
});

export default db;
