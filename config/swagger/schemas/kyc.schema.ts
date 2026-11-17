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

import piiMaskingDocModule = require('./pii-masking.doc');
const { MASKED_DOCUMENT_DESC, MASKED_PHONE_DESC, MASKED_EMAIL_DESC } = piiMaskingDocModule;

// ─── CountryComponent.build() ─────────────────────────────────
const Country = {
  type: 'object',
  properties: {
    countryId: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'Chile' },
    code: { type: 'string', example: 'CL' },
    iconUrl: { type: 'string', nullable: true, example: 'https://cdn.example.com/flags/cl.svg' },
    isActive: { type: 'boolean' }
  }
};

// ─── DepartmentComponent.build() ──────────────────────────────
const Department = {
  type: 'object',
  properties: {
    departmentId: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'Región Metropolitana' },
    daneCode: { type: 'string', nullable: true },
    countryId: { type: 'string', format: 'uuid' },
    isActive: { type: 'boolean' },
    // includeCountry = true
    country: { $ref: '#/components/schemas/Country', nullable: true }
  }
};

// ─── CityComponent.build() ────────────────────────────────────
const City = {
  type: 'object',
  properties: {
    cityId: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'Santiago' },
    daneCode: { type: 'string', nullable: true },
    departmentId: { type: 'string', format: 'uuid' },
    isActive: { type: 'boolean' },
    // includeDepartment = true
    department: { $ref: '#/components/schemas/Department', nullable: true }
  }
};

// ─── PhonePrefixComponent.build() ─────────────────────────────
const PhonePrefix = {
  type: 'object',
  properties: {
    phonePrefixId: { type: 'string', format: 'uuid' },
    prefix: { type: 'string', example: '+56' },
    countryId: { type: 'string', format: 'uuid' },
    isActive: { type: 'boolean' },
    // includeCountry = true
    country: { $ref: '#/components/schemas/Country', nullable: true }
  }
};

// ─── GenderComponent.build() ──────────────────────────────────
const Gender = {
  type: 'object',
  properties: {
    genderId: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'Masculino' },
    isActive: { type: 'boolean' }
  }
};

// ─── RoleComponent.build() ────────────────────────────────────
const Role = {
  type: 'object',
  properties: {
    roleId: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'client' },
    description: { type: 'string', nullable: true },
    isActive: { type: 'boolean' }
  }
};

// ─── AvatarThemeComponent.build() ─────────────────────────────
const AvatarTheme = {
  type: 'object',
  properties: {
    avatarThemeId: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'ocean' },
    isActive: { type: 'boolean' }
  }
};

// ─── AvatarComponent.build() ──────────────────────────────────
const Avatar = {
  type: 'object',
  properties: {
    avatarId: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'Fox' },
    imageUrl: { type: 'string', nullable: true },
    avatarThemeId: { type: 'string', format: 'uuid' },
    isActive: { type: 'boolean' },
    // includeTheme = true
    theme: { $ref: '#/components/schemas/AvatarTheme', nullable: true }
  }
};

// ─── UserComponent.build() ────────────────────────────────────
const User = {
  type: 'object',
  properties: {
    userId: { type: 'string', format: 'uuid' },
    username: { type: 'string', example: 'jperez' },
    personId: { type: 'string', format: 'uuid' },
    roleId: { type: 'string', format: 'uuid' },
    avatarId: { type: 'string', format: 'uuid', nullable: true },
    isActive: { type: 'boolean' },
    totpEnabled: { type: 'boolean' },
    smsMfaEnabled: { type: 'boolean' },
    preferredMfaMethod: { type: 'string', enum: ['none', 'totp', 'sms'], example: 'none' },
    privacyPolicyVersion: { type: 'string', nullable: true, example: '1.0' },
    privacyPolicyAcceptedAt: { type: 'string', format: 'date-time', nullable: true },
    privacyPolicyAcceptedIp: { type: 'string', nullable: true, example: '192.168.1.1' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    // includeRole = true
    role: {
      type: 'object',
      nullable: true,
      properties: {
        roleId: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        description: { type: 'string', nullable: true }
      }
    },
    // includeAvatar = true
    avatar: {
      type: 'object',
      nullable: true,
      properties: {
        avatarId: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        imageUrl: { type: 'string', nullable: true },
        theme: {
          type: 'object',
          nullable: true,
          properties: {
            avatarThemeId: { type: 'string', format: 'uuid' },
            name: { type: 'string' }
          }
        }
      }
    }
  }
};

// ─── PersonComponent.build() ──────────────────────────────────
const Person = {
  type: 'object',
  properties: {
    personId: { type: 'string', format: 'uuid' },
    firstName: { type: 'string', example: 'Juan' },
    lastName: { type: 'string', example: 'Pérez' },
    middleName: { type: 'string', nullable: true },
    secondLastName: { type: 'string', nullable: true },
    fullName: { type: 'string', example: 'Juan Pérez' },
    nationalId: {
      type: 'string',
      nullable: true,
      example: '******4050',
      description: MASKED_DOCUMENT_DESC
    },
    birthDate: { type: 'string', format: 'date', nullable: true, example: '1990-05-15' },
    genderId: { type: 'string', format: 'uuid', nullable: true },
    countryId: { type: 'string', format: 'uuid', nullable: true },
    documentTypeId: { type: 'string', format: 'uuid', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    // includeGender = true
    gender: {
      type: 'object',
      nullable: true,
      properties: {
        genderId: { type: 'string', format: 'uuid' },
        name: { type: 'string' }
      }
    },
    // includeDocumentType = true
    documentType: {
      type: 'object',
      nullable: true,
      description: 'Tipo de documento de identidad. Presente cuando se consulta el perfil básico o extendido.',
      properties: {
        documentTypeId: { type: 'string', format: 'uuid' },
        code: { type: 'string', example: 'CC' },
        name: { type: 'string', example: 'Cédula de Ciudadanía' }
      }
    },
    // includeNationality = true
    nationality: {
      type: 'object',
      nullable: true,
      properties: {
        countryId: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        code: { type: 'string' },
        iconUrl: { type: 'string', nullable: true }
      }
    }
  }
};

// ─── PersonContactComponent.build() ───────────────────────────
const PersonContact = {
  type: 'object',
  properties: {
    personContactId: { type: 'string', format: 'uuid' },
    personId: { type: 'string', format: 'uuid' },
    email: { type: 'string', example: '****n@example.com', description: MASKED_EMAIL_DESC },
    emailVerifiedAt: { type: 'string', format: 'date-time', nullable: true },
    isEmailVerified: { type: 'boolean' },
    phonePrimary: { type: 'string', nullable: true, example: '*****4567', description: MASKED_PHONE_DESC },
    phonePrimaryPrefixId: { type: 'string', format: 'uuid', nullable: true },
    phonePrimaryPrefix: { type: 'string', nullable: true, example: '+57' },
    phonePrimaryFull: { type: 'string', nullable: true, example: '********4567', description: MASKED_PHONE_DESC },
    phonePrimaryVerifiedAt: { type: 'string', format: 'date-time', nullable: true },
    isPhonePrimaryVerified: { type: 'boolean' },
    phoneSecondary: { type: 'string', nullable: true, description: MASKED_PHONE_DESC },
    phoneSecondaryPrefixId: { type: 'string', format: 'uuid', nullable: true },
    phoneSecondaryPrefix: { type: 'string', nullable: true },
    phoneSecondaryFull: { type: 'string', nullable: true, description: MASKED_PHONE_DESC },
    phoneSecondaryVerifiedAt: { type: 'string', format: 'date-time', nullable: true },
    isPhoneSecondaryVerified: { type: 'boolean' }
  }
};

// ─── PersonLocationComponent.build() ──────────────────────────
const PersonLocation = {
  type: 'object',
  properties: {
    personLocationId: { type: 'string', format: 'uuid' },
    personId: { type: 'string', format: 'uuid' },
    address: { type: 'string', example: 'Av. Providencia 1234' },
    postalCode: { type: 'string', nullable: true, example: '7500000' },
    type: { type: 'string', nullable: true, example: 'home' },
    countryId: { type: 'string', format: 'uuid', nullable: true },
    departmentId: { type: 'string', format: 'uuid' },
    cityId: { type: 'string', format: 'uuid' },
    country: {
      type: 'object',
      nullable: true,
      properties: {
        countryId: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        code: { type: 'string' },
        iconUrl: { type: 'string', nullable: true }
      }
    },
    department: {
      type: 'object',
      nullable: true,
      properties: {
        departmentId: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        daneCode: { type: 'string', nullable: true }
      }
    },
    city: {
      type: 'object',
      nullable: true,
      properties: {
        cityId: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        daneCode: { type: 'string', nullable: true }
      }
    }
  }
};

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

// ─── BasicProfile ─────────────────────────────────────────────
// Refleja exactamente lo que devuelve BasicProfileDTO(user)
const BasicProfile = {
  type: 'object',
  properties: {
    user: { $ref: '#/components/schemas/User' },
    person: { $ref: '#/components/schemas/Person', nullable: true },
    contact: { $ref: '#/components/schemas/PersonContact', nullable: true },
    location: { $ref: '#/components/schemas/PersonLocation', nullable: true },
    consents: {
      type: 'array',
      description:
        'Catálogo completo de consentimientos del usuario: **todos** los tipos activos, tanto los aceptados ' +
        '(`granted = true`, otorgamiento vigente) como los no aceptados o revocados (`granted = false`). ' +
        'Para los no aceptados, `userConsentId`, `privacyPolicy` y `grantedAt` quedan en `null` e ' +
        '`isCurrent = false`.',
      items: {
        type: 'object',
        properties: {
          consentType: {
            type: 'object',
            nullable: true,
            properties: {
              consentTypeId: { type: 'string', format: 'uuid' },
              code: { type: 'string', example: 'PRIVACY_POLICY' },
              name: { type: 'string', example: 'Política de Privacidad y Tratamiento de Datos' },
              isMandatory: { type: 'boolean' },
              isRevocable: { type: 'boolean', description: 'true = puede ser revocado por el usuario.' },
              isActive: { type: 'boolean' },
              scope: { type: 'string', nullable: true, example: 'ONBOARDING' }
            }
          },
          granted: {
            type: 'boolean',
            description: 'true si el usuario tiene un otorgamiento vigente para este tipo; false si no lo ha aceptado o lo revocó.',
            example: true
          },
          userConsentId: { type: 'string', format: 'uuid', nullable: true },
          privacyPolicy: {
            type: 'object',
            nullable: true,
            description: 'Versión de política aceptada. Solo presente para el tipo PRIVACY_POLICY otorgado.',
            properties: {
              privacyPolicyId: { type: 'string', format: 'uuid' },
              version: { type: 'string', example: '1.0' },
              documentUrl: { type: 'string', format: 'uri', description: 'URL pública del PDF.' },
              effectiveDate: { type: 'string', format: 'date-time' }
            }
          },
          grantedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Fecha y hora de aceptación.' },
          revokedAt: { type: 'string', format: 'date-time', nullable: true },
          isCurrent: { type: 'boolean', example: true }
        }
      }
    }
  }
};

// ─── ExtendedProfile ──────────────────────────────────────────
// Refleja exactamente lo que devuelve ExtendedProfileDTO(user)
const ExtendedProfile = {
  allOf: [{ $ref: '#/components/schemas/BasicProfile' }]
};

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

export = {
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
