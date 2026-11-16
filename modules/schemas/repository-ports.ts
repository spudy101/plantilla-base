// modules/schemas/repository-ports.ts
//
// Contratos públicos de los repositorios (generado con scripts/ts-migration/gen-repository-ports.js;
// no editar a mano). Solo tipos: no carga ningún repositorio.
//
// Cada service declara su dependencia con los métodos que usa (Interface Segregation) y la recibe
// por constructor (Dependency Inversion); el repositorio real o un doble de test encajan igual:
//
//   type UserReader = Pick<UserRepositoryPort, 'findByUserId'>;
//   constructor(deps: { userRepository?: UserReader } = {})
import type approvalRequestRepositoryModule = require('./core/repositories/approval-request.repository');
import type systemGlobalConfigRepositoryModule = require('./core/repositories/system-global-config.repository');
import type integrationApiLogRepositoryModule = require('./integration/repositories/integration-api-log.repository');
import type providerFallbackEventRepositoryModule = require('./integration/repositories/provider-fallback-event.repository');
import type authTrustedDeviceRepositoryModule = require('./kyc/iam/repositories/auth-trusted-device.repository');
import type biometricRepositoryModule = require('./kyc/iam/repositories/biometric.repository');
import type resetCredentialsRepositoryModule = require('./kyc/iam/repositories/reset-credentials.repository');
import type rolePermissionOverrideRepositoryModule = require('./kyc/iam/repositories/role-permission-override.repository');
import type roleRepositoryModule = require('./kyc/iam/repositories/role.repository');
import type userSessionRepositoryModule = require('./kyc/iam/repositories/user-session.repository');
import type userRepositoryModule = require('./kyc/iam/repositories/user.repository');
import type avatarThemeRepositoryModule = require('./kyc/maintainers/repositories/avatar-theme.repository');
import type avatarRepositoryModule = require('./kyc/maintainers/repositories/avatar.repository');
import type cityRepositoryModule = require('./kyc/maintainers/repositories/city.repository');
import type countryRepositoryModule = require('./kyc/maintainers/repositories/country.repository');
import type departmentRepositoryModule = require('./kyc/maintainers/repositories/department.repository');
import type documentTypeRepositoryModule = require('./kyc/maintainers/repositories/document-type.repository');
import type genderRepositoryModule = require('./kyc/maintainers/repositories/gender.repository');
import type phonePrefixRepositoryModule = require('./kyc/maintainers/repositories/phone-prefix.repository');
import type personContactRepositoryModule = require('./kyc/person/repositories/person-contact.repository');
import type personLocationRepositoryModule = require('./kyc/person/repositories/person-location.repository');
import type personReferenceRepositoryModule = require('./kyc/person/repositories/person-reference.repository');
import type personRepositoryModule = require('./kyc/person/repositories/person.repository');
import type userNotificationPreferenceRepositoryModule = require('./kyc/person/repositories/user-notification-preference.repository');
import type emailBounceSuppressionRepositoryModule = require('./notification/repositories/email-bounce-suppression.repository');
import type globalNotificationReadRepositoryModule = require('./notification/repositories/global-notification-read.repository');
import type globalNotificationRepositoryModule = require('./notification/repositories/global-notification.repository');
import type notificationCategoryRepositoryModule = require('./notification/repositories/notification-category.repository');
import type notificationTypeRepositoryModule = require('./notification/repositories/notification-type.repository');
import type notificationRepositoryModule = require('./notification/repositories/notification.repository');
import type smsDeliveryAttemptRepositoryModule = require('./notification/repositories/sms-delivery-attempt.repository');
import type userPushTokenRepositoryModule = require('./notification/repositories/user-push-token.repository');
import type verificationCodeRepositoryModule = require('./notification/repositories/verification-code.repository');
import type auditAlertRepositoryModule = require('./records/audit/repositories/audit-alert.repository');
import type auditLogRepositoryModule = require('./records/audit/repositories/audit-log.repository');
import type userChangeLogRepositoryModule = require('./records/audit/repositories/user-change-log.repository');
import type userLoginAttemptRepositoryModule = require('./records/audit/repositories/user-login-attempt.repository');
import type consentTypeRepositoryModule = require('./records/legal/repositories/consent-type.repository');
import type privacyPolicyAdminRepositoryModule = require('./records/legal/repositories/privacy-policy-admin.repository');
import type privacyPolicyRepositoryModule = require('./records/legal/repositories/privacy-policy.repository');
import type userConsentRepositoryModule = require('./records/legal/repositories/user-consent.repository');

export type ApprovalRequestRepositoryPort = typeof approvalRequestRepositoryModule;
export type SystemGlobalConfigRepositoryPort = typeof systemGlobalConfigRepositoryModule;
export type IntegrationApiLogRepositoryPort = typeof integrationApiLogRepositoryModule;
export type ProviderFallbackEventRepositoryPort = typeof providerFallbackEventRepositoryModule;
export type TrustedDeviceRepositoryPort = typeof authTrustedDeviceRepositoryModule;
export type BiometricCredentialRepositoryPort = (typeof biometricRepositoryModule)['biometricCredentialRepository'];
export type BiometricChallengeRepositoryPort = (typeof biometricRepositoryModule)['biometricChallengeRepository'];
export type ResetCredentialsRepositoryPort = typeof resetCredentialsRepositoryModule;
export type RolePermissionOverrideRepositoryPort = typeof rolePermissionOverrideRepositoryModule;
export type RoleRepositoryPort = typeof roleRepositoryModule;
export type UserSessionRepositoryPort = typeof userSessionRepositoryModule;
export type UserRepositoryPort = typeof userRepositoryModule;
export type AvatarThemeRepositoryPort = typeof avatarThemeRepositoryModule;
export type AvatarRepositoryPort = typeof avatarRepositoryModule;
export type CityRepositoryPort = typeof cityRepositoryModule;
export type CountryRepositoryPort = typeof countryRepositoryModule;
export type DepartmentRepositoryPort = typeof departmentRepositoryModule;
export type DocumentTypeRepositoryPort = typeof documentTypeRepositoryModule;
export type GenderRepositoryPort = typeof genderRepositoryModule;
export type PhonePrefixRepositoryPort = typeof phonePrefixRepositoryModule;
export type PersonContactRepositoryPort = typeof personContactRepositoryModule;
export type PersonLocationRepositoryPort = typeof personLocationRepositoryModule;
export type PersonReferenceRepositoryPort = typeof personReferenceRepositoryModule;
export type PersonRepositoryPort = typeof personRepositoryModule;
export type UserNotificationPreferenceRepositoryPort = typeof userNotificationPreferenceRepositoryModule;
export type EmailBounceSuppressionRepositoryPort = typeof emailBounceSuppressionRepositoryModule;
export type GlobalNotificationReadRepositoryPort = typeof globalNotificationReadRepositoryModule;
export type GlobalNotificationRepositoryPort = typeof globalNotificationRepositoryModule;
export type NotificationCategoryRepositoryPort = typeof notificationCategoryRepositoryModule;
export type NotificationTypeRepositoryPort = typeof notificationTypeRepositoryModule;
export type NotificationRepositoryPort = typeof notificationRepositoryModule;
export type SmsDeliveryAttemptRepositoryPort = typeof smsDeliveryAttemptRepositoryModule;
export type UserPushTokenRepositoryPort = typeof userPushTokenRepositoryModule;
export type VerificationCodeRepositoryPort = typeof verificationCodeRepositoryModule;
export type AuditAlertRepositoryPort = typeof auditAlertRepositoryModule;
export type AuditLogRepositoryPort = typeof auditLogRepositoryModule;
export type UserChangeLogRepositoryPort = typeof userChangeLogRepositoryModule;
export type UserLoginAttemptRepositoryPort = typeof userLoginAttemptRepositoryModule;
export type ConsentTypeRepositoryPort = typeof consentTypeRepositoryModule;
export type PrivacyPolicyAdminRepositoryPort = typeof privacyPolicyAdminRepositoryModule;
export type PrivacyPolicyRepositoryPort = typeof privacyPolicyRepositoryModule;
export type UserConsentRepositoryPort = typeof userConsentRepositoryModule;
