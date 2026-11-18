/**
 * ============================================================
 * KYC SCHEMA — Global
 * ============================================================
 * Derivado de:
 *   components-kyc.dto.js
 *   components-catalog.dto.js
 *
 * Mapa DTO → Schema:
 *   CountryComponent              → Country
 *   DepartmentComponent           → Department
 *   CityComponent                 → City
 *   PhonePrefixComponent          → PhonePrefix
 *   GenderComponent               → Gender
 *   RoleComponent                 → Role
 *   AvatarThemeComponent          → AvatarTheme
 *   AvatarComponent               → Avatar
 *   UserComponent                 → User
 *   PersonComponent               → Person
 *   PersonContactComponent        → PersonContact
 *   PersonLocationComponent       → PersonLocation
 *   VerificationCodeComponent     → VerificationCode
 *   UserLoginAttemptComponent     → UserLoginAttempt
 *   ResetCredentialsComponent     → ResetCredentials
 *   UserChangeLogComponent        → UserChangeLog
 *
 * [RF-USR-01] | CA-06 | Los campos de RESPUESTA con documento, correo, teléfono, TIN y número de
 * cuenta salen SIEMPRE enmascarados (últimos 4). Los campos de REQUEST van completos.
 */

import piiMaskingDocModule from '../../../shared/validation/pii-masking.doc';
import { toOpenApi } from '../../../shared/validation/openapi';
import {
  AvatarSchema,
  AvatarThemeSchema,
  CitySchema,
  CountrySchema,
  DepartmentSchema,
  GenderSchema,
  PhonePrefixSchema,
  RoleSchema
} from '../../../modules/catalogs/responses/catalog-components.response';
import {
  PersonContactSchema,
  PersonLocationSchema,
  PersonSchema,
  UserSchema
} from '../../../modules/person/responses/person-components.response';
import { ProfileSchema } from '../../../modules/person/responses/profile.response';
const { MASKED_DOCUMENT_DESC, MASKED_EMAIL_DESC } = piiMaskingDocModule;

// Catálogos: generados desde los esquemas Zod de modules/catalogs (lo que de verdad arman sus componentes)
const Country = toOpenApi(CountrySchema, 'output');
const Department = toOpenApi(DepartmentSchema, 'output');
const City = toOpenApi(CitySchema, 'output');
const PhonePrefix = toOpenApi(PhonePrefixSchema, 'output');
const Gender = toOpenApi(GenderSchema, 'output');
const Role = toOpenApi(RoleSchema, 'output');
const AvatarTheme = toOpenApi(AvatarThemeSchema, 'output');
const Avatar = toOpenApi(AvatarSchema, 'output');
const User = toOpenApi(UserSchema, 'output');

const Person = toOpenApi(PersonSchema, 'output');

const PersonContact = toOpenApi(PersonContactSchema, 'output');

const PersonLocation = toOpenApi(PersonLocationSchema, 'output');

// ─── VerificationCodeComponent.build() ────────────────────────
const VerificationCode = {
  type: 'object',
  properties: {
    verificationCodeId: { type: 'string', format: 'uuid' },
    type: { type: 'string', example: 'email' },
    contactValue: {
      type: 'string',
      example: '****n@example.com',
      description: `Destino del OTP (correo o celular). ${MASKED_EMAIL_DESC}`
    },
    attempts: { type: 'integer' },
    expiresAt: { type: 'string', format: 'date-time' },
    verifiedAt: { type: 'string', format: 'date-time', nullable: true },
    isVerified: { type: 'boolean' },
    isExpired: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' }
  }
};

// ─── UserLoginAttemptComponent.build() ────────────────────────
const UserLoginAttempt = {
  type: 'object',
  properties: {
    userLoginAttemptId: { type: 'string', format: 'uuid' },
    userId: { type: 'string', format: 'uuid', nullable: true },
    usernameAttempt: { type: 'string' },
    nationalId: { type: 'string', example: '******4050', description: MASKED_DOCUMENT_DESC },
    ipAddress: { type: 'string', nullable: true },
    userAgent: { type: 'string', nullable: true },
    deviceFingerprint: { type: 'string', nullable: true },
    success: { type: 'boolean' },
    failureReason: { type: 'string', nullable: true },
    blockedUntil: { type: 'string', format: 'date-time', nullable: true },
    sessionCacheKey: { type: 'string', nullable: true },
    attemptedAt: { type: 'string', format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' }
  }
};

// ─── ResetCredentialsComponent.build() ────────────────────────
const ResetCredentials = {
  type: 'object',
  properties: {
    resetCredentialsId: { type: 'string', format: 'uuid' },
    userId: { type: 'string', format: 'uuid' },
    email: { type: 'string', example: '****n@example.com', description: MASKED_EMAIL_DESC },
    type: { type: 'string', example: 'password' },
    expiresAt: { type: 'string', format: 'date-time' },
    used: { type: 'boolean' },
    usedAt: { type: 'string', format: 'date-time', nullable: true },
    isExpired: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' }
  }
};

// ─── UserChangeLogComponent.build() ───────────────────────────
const UserChangeLog = {
  type: 'object',
  properties: {
    logId: { type: 'string', format: 'uuid' },
    userId: { type: 'string', format: 'uuid' },
    changedByUserId: { type: 'string', format: 'uuid', nullable: true },
    changedByRole: { type: 'string' },
    changeType: { type: 'string' },
    previousValue: {
      type: 'string',
      nullable: true,
      description:
        'Valor anterior. Si es un correo, documento o teléfono sale **enmascarado** (RF-USR-01 CA-6); ' +
        'los valores sin forma de PII (p. ej. `activo`) se devuelven tal cual. Las contraseñas van como `hidden`.'
    },
    newValue: {
      type: 'string',
      nullable: true,
      description: 'Valor nuevo. Mismo criterio de enmascaramiento que `previousValue`.'
    },
    changeReason: { type: 'string', nullable: true },
    ipAddress: { type: 'string', nullable: true },
    userAgent: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' }
  }
};

// ─── TrustedDeviceComponent.build() ──────────────────────────
const TrustedDevice = {
  type: 'object',
  properties: {
    userTrustedDeviceId: { type: 'string', format: 'uuid' },
    userId: { type: 'string', format: 'uuid' },
    deviceName: { type: 'string' },
    fingerprintHash: { type: 'string' },
    isCurrent: { type: 'boolean' },
    status: { type: 'string' },
    isPending: { type: 'boolean' },
    ipAddress: { type: 'string', nullable: true },
    city: { type: 'string', nullable: true },
    country: { type: 'string', nullable: true },
    countryCode: { type: 'string', nullable: true },
    browser: { type: 'string', nullable: true },
    os: { type: 'string', nullable: true },
    deviceType: { type: 'string', example: 'desktop' },
    approvedByDeviceId: { type: 'string', format: 'uuid', nullable: true },
    approvedAt: { type: 'string', format: 'date-time', nullable: true },
    // Sesión activa del dispositivo (primera sesión asociada)
    activeSession: { $ref: '#/components/schemas/UserSession', nullable: true },
    trustedAt: { type: 'string', format: 'date-time' },
    lastSeenAt: { type: 'string', format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

const BasicProfile = toOpenApi(ProfileSchema, 'output');

const ExtendedProfile = toOpenApi(ProfileSchema, 'output');

// ─── UserSessionComponent.build() ────────────────────────────
const UserSession = {
  type: 'object',
  properties: {
    sessionId: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: ['active', 'closed', 'expired'], example: 'active' },
    ipAddress: { type: 'string', nullable: true, example: '192.168.1.1' },
    userAgent: { type: 'string', nullable: true },
    startedAt: { type: 'string', format: 'date-time' },
    lastAccessAt: { type: 'string', format: 'date-time' },
    closedAt: { type: 'string', format: 'date-time', nullable: true },
    closeReason: { type: 'string', nullable: true, example: 'role_changed' }
  }
};

// ─── Exports ──────────────────────────────────────────────────

export default {
  // Catálogo geográfico
  Country,
  Department,
  City,
  PhonePrefix,

  // Catálogo de persona
  Gender,

  // Catálogo de sistema
  Role,
  AvatarTheme,
  Avatar,

  // Usuario y persona
  User,
  Person,
  PersonContact,
  PersonLocation,

  // Auth y auditoría
  VerificationCode,
  UserLoginAttempt,
  ResetCredentials,
  UserChangeLog,
  UserSession,

  // Perfiles
  BasicProfile,
  ExtendedProfile,

  // TrustedDevice
  TrustedDevice
};
