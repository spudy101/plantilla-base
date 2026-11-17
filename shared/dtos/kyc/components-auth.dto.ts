import EncryptionUtil = require('../../utils/encryption.util');
import MaskingUtil = require('../../utils/masking.util');
import type { DbDate, Maybe, UserRefRow } from '../../types/db-rows';

interface VerificationCodeRow {
  verification_code_id: string;
  type: string;
  contact_value?: Maybe<string>;
  attempts?: Maybe<number>;
  expires_at: DbDate;
  verified_at?: Maybe<DbDate>;
  createdAt?: Maybe<DbDate>;
}

interface UserLoginAttemptRow {
  user_login_attempt_id: string;
  user_id?: Maybe<string>;
  username_attempt?: Maybe<string>;
  national_id?: Maybe<string>;
  ip_address?: Maybe<string>;
  user_agent?: Maybe<string>;
  device_fingerprint?: Maybe<string>;
  success: boolean;
  failure_reason?: Maybe<string>;
  blocked_until?: Maybe<DbDate>;
  session_cache_key?: Maybe<string>;
  origin_session_id?: Maybe<string>;
  attempted_at?: Maybe<DbDate>;
  createdAt?: Maybe<DbDate>;
}

interface ResetCredentialsRow {
  reset_credentials_id: string;
  user_id: string;
  email?: Maybe<string>;
  type: string;
  token?: Maybe<string>;
  expires_at: DbDate;
  used?: Maybe<boolean>;
  used_at?: Maybe<DbDate>;
  createdAt?: Maybe<DbDate>;
}

interface UserChangeLogRow {
  log_id: string;
  user_id: string;
  user?: Maybe<UserRefRow>;
  changed_by_user_id?: Maybe<string>;
  changed_by_role?: Maybe<string>;
  changedBy?: Maybe<UserRefRow>;
  change_type: string;
  previous_value?: unknown;
  new_value?: unknown;
  change_reason?: Maybe<string>;
  ip_address?: Maybe<string>;
  user_agent?: Maybe<string>;
  origin_session_id?: Maybe<string>;
  createdAt?: Maybe<DbDate>;
  created_at?: Maybe<DbDate>;
}

interface UserSessionRow {
  user_session_id: string;
  status: string;
  ip_address?: Maybe<string>;
  user_agent?: Maybe<string>;
  started_at?: Maybe<DbDate>;
  last_access_at?: Maybe<DbDate>;
  closed_at?: Maybe<DbDate>;
  close_reason?: Maybe<string>;
  createdAt?: Maybe<DbDate>;
  sessionUser?: Maybe<UserRefRow>;
}

interface TrustedDeviceRow {
  user_trusted_device_id: string;
  user_id: string;
  device_name?: Maybe<string>;
  fingerprint_hash?: Maybe<string>;
  status: string;
  ip_address?: Maybe<string>;
  city?: Maybe<string>;
  country?: Maybe<string>;
  country_code?: Maybe<string>;
  browser?: Maybe<string>;
  os?: Maybe<string>;
  device_type?: Maybe<string>;
  approved_by_device_id?: Maybe<string>;
  approved_at?: Maybe<DbDate>;
  blocked_by_device_id?: Maybe<string>;
  blocked_at?: Maybe<DbDate>;
  trusted_at?: Maybe<DbDate>;
  last_seen_at?: Maybe<DbDate>;
  createdAt?: Maybe<DbDate>;
  updatedAt?: Maybe<DbDate>;
  /** Sesión activa del dispositivo (include con limit 1) */
  sessions?: Maybe<UserSessionRow[]>;
}

interface BiometricCredentialRow {
  biometric_credential_id: string;
  user_trusted_device_id: string;
  credential_id: string;
  sign_count: number;
  is_active: boolean;
  last_used_at?: Maybe<DbDate>;
  createdAt?: Maybe<DbDate>;
}

function _buildUserRef(user: Maybe<UserRefRow>) {
  if (!user) {
    return null;
  }
  return {
    userId: user.user_id,
    username: user.username,
    fullName: [user.person?.first_name, user.person?.last_name].filter(Boolean).join(' ') || null
  };
}

// ============================================================
// VERIFICATION CODE
// ============================================================

class VerificationCodeComponent {
  static build(verificationCode: Maybe<VerificationCodeRow>) {
    if (!verificationCode) {
      return null;
    }
    return {
      verificationCodeId: verificationCode.verification_code_id,
      type: verificationCode.type,
      // [RF-USR-01] | CA-06 | Destino del OTP: correo o celular según el tipo → máscara por forma.
      contactValue: MaskingUtil.maskAuto(verificationCode.contact_value),
      attempts: verificationCode.attempts,
      expiresAt: verificationCode.expires_at,
      verifiedAt: verificationCode.verified_at || null,
      isVerified: !!verificationCode.verified_at,
      isExpired: new Date() > new Date(verificationCode.expires_at),
      createdAt: verificationCode.createdAt
    };
  }
}

// ============================================================
// USER LOGIN ATTEMPT
// ============================================================

class UserLoginAttemptComponent {
  static build(attempt: Maybe<UserLoginAttemptRow>) {
    if (!attempt) {
      return null;
    }
    return {
      userLoginAttemptId: attempt.user_login_attempt_id,
      userId: attempt.user_id || null,
      usernameAttempt: attempt.username_attempt,
      nationalId: MaskingUtil.maskDocumentId(EncryptionUtil.safeDecrypt(attempt.national_id)),
      ipAddress: attempt.ip_address || null,
      userAgent: attempt.user_agent || null,
      deviceFingerprint: attempt.device_fingerprint || null,
      success: attempt.success,
      failureReason: attempt.failure_reason || null,
      blockedUntil: attempt.blocked_until || null,
      sessionCacheKey: attempt.session_cache_key || null,
      // Sesión resultante del login. Con valor en los intentos exitosos, null en los fallidos (nunca
      // hubo sesión). Es el reemplazo real de sessionCacheKey, que quedó siempre en null.
      originSessionId: attempt.origin_session_id || null,
      attemptedAt: attempt.attempted_at,
      createdAt: attempt.createdAt
    };
  }

  static buildArray(attempts: Maybe<UserLoginAttemptRow[]>) {
    if (!attempts || attempts.length === 0) {
      return [];
    }
    return attempts.map(a => UserLoginAttemptComponent.build(a));
  }
}

// ============================================================
// RESET CREDENTIALS
// ============================================================

class ResetCredentialsComponent {
  static build(resetCredential: Maybe<ResetCredentialsRow>, includeToken = false) {
    if (!resetCredential) {
      return null;
    }

    const dto: Record<string, unknown> & { token?: Maybe<string> } = {
      resetCredentialsId: resetCredential.reset_credentials_id,
      userId: resetCredential.user_id,
      // [RF-USR-01] | CA-06
      email: MaskingUtil.maskEmail(resetCredential.email) || null,
      type: resetCredential.type,
      expiresAt: resetCredential.expires_at,
      used: resetCredential.used,
      usedAt: resetCredential.used_at || null,
      isExpired: new Date() > new Date(resetCredential.expires_at),
      createdAt: resetCredential.createdAt
    };

    if (includeToken) {
      dto.token = resetCredential.token;
    }

    return dto;
  }
}

// ============================================================
// USER CHANGE LOG
// ============================================================

const SENSITIVE_LOG_TYPES = new Set(['email', 'phone', 'national_id']);

function _maskLogValue(value: unknown, changeType: string): unknown {
  if (!value) {
    return value;
  }
  if (changeType === 'email') {
    return MaskingUtil.maskEmail(value);
  }
  if (SENSITIVE_LOG_TYPES.has(changeType)) {
    return MaskingUtil.maskDocumentId(value);
  }
  // [RF-USR-01] | CA-06 | Red para los change_type que no están en la lista: si el valor TIENE forma
  // de correo o de número (documento/celular) se enmascara; un estado como 'activo' pasa intacto.
  return MaskingUtil.maskAuto(value);
}

class UserChangeLogComponent {
  static build(log: Maybe<UserChangeLogRow>) {
    if (!log) {
      return null;
    }
    return {
      logId: log.log_id,
      userId: log.user_id,
      user: _buildUserRef(log.user),
      changedByUserId: log.changed_by_user_id || null,
      changedByRole: log.changed_by_role,
      changedBy: _buildUserRef(log.changedBy),
      changeType: log.change_type,
      previousValue: _maskLogValue(log.previous_value, log.change_type),
      newValue: _maskLogValue(log.new_value, log.change_type),
      changeReason: log.change_reason || null,
      ipAddress: log.ip_address || null,
      userAgent: log.user_agent || null,
      // Alinea esta tabla de auditoría con audit_logs.session_id (consistencia pedida en §3 Fase 3).
      originSessionId: log.origin_session_id || null,
      // created_at existe cuando el repo lo selecciona por columna; si no, el atributo createdAt
      createdAt: log.createdAt ?? log.created_at
    };
  }

  static buildArray(logs: Maybe<UserChangeLogRow[]>) {
    if (!logs || logs.length === 0) {
      return [];
    }
    return logs.map(l => UserChangeLogComponent.build(l));
  }
}

// ============================================================
// USER SESSION
// ============================================================

class UserSessionComponent {
  static build(session: Maybe<UserSessionRow>) {
    if (!session) {
      return null;
    }
    return {
      sessionId: session.user_session_id,
      status: session.status,
      ipAddress: session.ip_address || null,
      userAgent: session.user_agent || null,
      startedAt: session.started_at,
      lastAccessAt: session.last_access_at,
      closedAt: session.closed_at || null,
      closeReason: session.close_reason || null,
      createdAt: session.createdAt,
      user: _buildUserRef(session.sessionUser)
    };
  }

  static buildArray(sessions: Maybe<UserSessionRow[]>) {
    if (!sessions || sessions.length === 0) {
      return [];
    }
    return sessions.map(s => UserSessionComponent.build(s));
  }
}

// ============================================================
// TRUSTED DEVICE
// ============================================================

class TrustedDeviceComponent {
  static build(device: Maybe<TrustedDeviceRow>, currentFingerprintHash: string | null = null, currentSessionId: string | null = null) {
    if (!device) {
      return null;
    }

    const activeSession = device.sessions?.[0] ? UserSessionComponent.build(device.sessions[0]) : null;

    const isCurrent = currentSessionId
      ? activeSession?.sessionId === currentSessionId
      : currentFingerprintHash
        ? device.fingerprint_hash === currentFingerprintHash
        : false;

    return {
      userTrustedDeviceId: device.user_trusted_device_id,
      userId: device.user_id,
      deviceName: device.device_name,
      fingerprintHash: device.fingerprint_hash,
      isCurrent,
      status: device.status,
      isPending: device.status === 'pending',
      ipAddress: device.ip_address || null,
      city: device.city || null,
      country: device.country || null,
      countryCode: device.country_code || null,
      browser: device.browser || null,
      os: device.os || null,
      deviceType: device.device_type || 'desktop',
      approvedByDeviceId: device.approved_by_device_id || null,
      approvedAt: device.approved_at || null,
      blockedByDeviceId: device.blocked_by_device_id || null,
      blockedAt: device.blocked_at || null,
      activeSession,
      trustedAt: device.trusted_at,
      lastSeenAt: device.last_seen_at,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt
    };
  }

  static buildArray(
    devices: Maybe<TrustedDeviceRow[]>,
    currentFingerprintHash: string | null = null,
    currentSessionId: string | null = null
  ) {
    if (!devices || devices.length === 0) {
      return [];
    }
    return devices.map(d => TrustedDeviceComponent.build(d, currentFingerprintHash, currentSessionId));
  }
}

// ============================================================
// BIOMETRIC CREDENTIAL
// ============================================================

class BiometricCredentialComponent {
  static build(credential: Maybe<BiometricCredentialRow>) {
    if (!credential) {
      return null;
    }
    return {
      biometricCredentialId: credential.biometric_credential_id,
      deviceId: credential.user_trusted_device_id,
      credentialId: credential.credential_id,
      signCount: credential.sign_count,
      isActive: credential.is_active,
      lastUsedAt: credential.last_used_at || null,
      createdAt: credential.createdAt
    };
  }

  static buildArray(credentials: Maybe<BiometricCredentialRow[]>) {
    if (!credentials || credentials.length === 0) {
      return [];
    }
    return credentials.map(c => BiometricCredentialComponent.build(c)).filter(Boolean);
  }
}

export = {
  VerificationCodeComponent,
  UserLoginAttemptComponent,
  ResetCredentialsComponent,
  UserChangeLogComponent,
  BiometricCredentialComponent,
  UserSessionComponent,
  TrustedDeviceComponent
};
