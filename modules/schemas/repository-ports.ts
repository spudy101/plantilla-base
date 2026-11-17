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
import type approvalRequestRepositoryModule from './core/repositories/approval-request.repository';
import type systemGlobalConfigRepositoryModule from './core/repositories/system-global-config.repository';
import type integrationApiLogRepositoryModule from './integration/repositories/integration-api-log.repository';
import type providerFallbackEventRepositoryModule from './integration/repositories/provider-fallback-event.repository';
import type authTrustedDeviceRepositoryModule from './kyc/iam/repositories/auth-trusted-device.repository';
import type biometricRepositoryModule from './kyc/iam/repositories/biometric.repository';
import type resetCredentialsRepositoryModule from './kyc/iam/repositories/reset-credentials.repository';
import type rolePermissionOverrideRepositoryModule from './kyc/iam/repositories/role-permission-override.repository';
import type roleRepositoryModule from './kyc/iam/repositories/role.repository';
import type userSessionRepositoryModule from './kyc/iam/repositories/user-session.repository';
import type userRepositoryModule from './kyc/iam/repositories/user.repository';
import type avatarThemeRepositoryModule from './kyc/maintainers/repositories/avatar-theme.repository';
import type avatarRepositoryModule from './kyc/maintainers/repositories/avatar.repository';
import type cityRepositoryModule from './kyc/maintainers/repositories/city.repository';
import type countryRepositoryModule from './kyc/maintainers/repositories/country.repository';
import type departmentRepositoryModule from './kyc/maintainers/repositories/department.repository';
import type documentTypeRepositoryModule from './kyc/maintainers/repositories/document-type.repository';
import type genderRepositoryModule from './kyc/maintainers/repositories/gender.repository';
import type phonePrefixRepositoryModule from './kyc/maintainers/repositories/phone-prefix.repository';
import type personContactRepositoryModule from './kyc/person/repositories/person-contact.repository';
import type personLocationRepositoryModule from './kyc/person/repositories/person-location.repository';
import type personReferenceRepositoryModule from './kyc/person/repositories/person-reference.repository';
import type personRepositoryModule from './kyc/person/repositories/person.repository';
import type userNotificationPreferenceRepositoryModule from './kyc/person/repositories/user-notification-preference.repository';
import type emailBounceSuppressionRepositoryModule from './notification/repositories/email-bounce-suppression.repository';
import type globalNotificationReadRepositoryModule from './notification/repositories/global-notification-read.repository';
import type globalNotificationRepositoryModule from './notification/repositories/global-notification.repository';
import type notificationCategoryRepositoryModule from './notification/repositories/notification-category.repository';
import type notificationTypeRepositoryModule from './notification/repositories/notification-type.repository';
import type notificationRepositoryModule from './notification/repositories/notification.repository';
import type smsDeliveryAttemptRepositoryModule from './notification/repositories/sms-delivery-attempt.repository';
import type userPushTokenRepositoryModule from './notification/repositories/user-push-token.repository';
import type verificationCodeRepositoryModule from './notification/repositories/verification-code.repository';
import type auditAlertRepositoryModule from './records/audit/repositories/audit-alert.repository';
import type auditLogRepositoryModule from './records/audit/repositories/audit-log.repository';
import type userChangeLogRepositoryModule from './records/audit/repositories/user-change-log.repository';
import type userLoginAttemptRepositoryModule from './records/audit/repositories/user-login-attempt.repository';
import type consentTypeRepositoryModule from './records/legal/repositories/consent-type.repository';
import type privacyPolicyAdminRepositoryModule from './records/legal/repositories/privacy-policy-admin.repository';
import type privacyPolicyRepositoryModule from './records/legal/repositories/privacy-policy.repository';
import type userConsentRepositoryModule from './records/legal/repositories/user-consent.repository';

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
