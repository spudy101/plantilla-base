import EncryptionUtil from '../../utils/encryption.util';
import MaskingUtil from '../../utils/masking.util';
import type { DbDate, Maybe, UserRefRow } from '../../types/db-rows';

/** Fila de Prisma (verification_codes migró en la fase 5, grupo 3). */
interface VerificationCodeRow {
  verificationCodeId: string;
  type: string;
  contactValue?: Maybe<string>;
  attempts?: Maybe<number>;
  expiresAt: DbDate;
  verifiedAt?: Maybe<DbDate>;
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

// Filas de Prisma (camelCase): reset_credentials, user_change_logs, user_sessions, user_trusted_devices
// y user_biometric_credentials migraron en la fase 5, grupo 6.
interface ResetCredentialsRow {
  resetCredentialsId: string;
  userId: string;
  email?: Maybe<string>;
  type: string;
  token?: Maybe<string>;
  expiresAt: DbDate;
  used?: Maybe<boolean>;
  usedAt?: Maybe<DbDate>;
  createdAt?: Maybe<DbDate>;
}

interface UserChangeLogRow {
  logId: string;
  userId: string;
  user?: Maybe<UserRefRow>;
  changedByUserId?: Maybe<string>;
  changedByRole?: Maybe<string>;
  changedBy?: Maybe<UserRefRow>;
  changeType: string;
  previousValue?: unknown;
  newValue?: unknown;
  changeReason?: Maybe<string>;
  ipAddress?: Maybe<string>;
  userAgent?: Maybe<string>;
  originSessionId?: Maybe<string>;
  createdAt?: Maybe<DbDate>;
}

interface UserSessionRow {
  userSessionId: string;
  status: string;
  ipAddress?: Maybe<string>;
  userAgent?: Maybe<string>;
  startedAt?: Maybe<DbDate>;
  lastAccessAt?: Maybe<DbDate>;
  closedAt?: Maybe<DbDate>;
  closeReason?: Maybe<string>;
  createdAt?: Maybe<DbDate>;
  sessionUser?: Maybe<UserRefRow>;
}

interface TrustedDeviceRow {
  userTrustedDeviceId: string;
  userId: string;
  deviceName?: Maybe<string>;
  fingerprintHash?: Maybe<string>;
  status: string;
  ipAddress?: Maybe<string>;
  city?: Maybe<string>;
  country?: Maybe<string>;
  countryCode?: Maybe<string>;
  browser?: Maybe<string>;
  os?: Maybe<string>;
  deviceType?: Maybe<string>;
  approvedByDeviceId?: Maybe<string>;
  approvedAt?: Maybe<DbDate>;
  blockedByDeviceId?: Maybe<string>;
  blockedAt?: Maybe<DbDate>;
  trustedAt?: Maybe<DbDate>;
  lastSeenAt?: Maybe<DbDate>;
  createdAt?: Maybe<DbDate>;
  updatedAt?: Maybe<DbDate>;
  /** Última sesión del dispositivo (include con take 1) */
  sessions?: Maybe<UserSessionRow[]>;
}

interface BiometricCredentialRow {
  biometricCredentialId: string;
  userTrustedDeviceId: string;
  credentialId: string;
  signCount: number;
  isActive: boolean;
  lastUsedAt?: Maybe<DbDate>;
  createdAt?: Maybe<DbDate>;
}

function _buildUserRef(user: Maybe<UserRefRow>) {
  if (!user) {
    return null;
  }
  return {
    userId: user.userId,
    username: user.username,
    fullName: [user.person?.firstName, user.person?.lastName].filter(Boolean).join(' ') || null
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
      verificationCodeId: verificationCode.verificationCodeId,
      type: verificationCode.type,
      // [RF-USR-01] | CA-06 | Destino del OTP: correo o celular según el tipo → máscara por forma.
      contactValue: MaskingUtil.maskAuto(verificationCode.contactValue),
      attempts: verificationCode.attempts,
      expiresAt: verificationCode.expiresAt,
      verifiedAt: verificationCode.verifiedAt || null,
      isVerified: !!verificationCode.verifiedAt,
      isExpired: new Date() > new Date(verificationCode.expiresAt),
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
      resetCredentialsId: resetCredential.resetCredentialsId,
      userId: resetCredential.userId,
      // [RF-USR-01] | CA-06
      email: MaskingUtil.maskEmail(resetCredential.email) || null,
      type: resetCredential.type,
      expiresAt: resetCredential.expiresAt,
      used: resetCredential.used,
      usedAt: resetCredential.usedAt || null,
      isExpired: new Date() > new Date(resetCredential.expiresAt),
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
      logId: log.logId,
      userId: log.userId,
      user: _buildUserRef(log.user),
      changedByUserId: log.changedByUserId || null,
      changedByRole: log.changedByRole,
      changedBy: _buildUserRef(log.changedBy),
      changeType: log.changeType,
      previousValue: _maskLogValue(log.previousValue, log.changeType),
      newValue: _maskLogValue(log.newValue, log.changeType),
      changeReason: log.changeReason || null,
      ipAddress: log.ipAddress || null,
      userAgent: log.userAgent || null,
      // Alinea esta tabla de auditoría con audit_logs.session_id (consistencia pedida en §3 Fase 3).
      originSessionId: log.originSessionId || null,
      createdAt: log.createdAt
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
      sessionId: session.userSessionId,
      status: session.status,
      ipAddress: session.ipAddress || null,
      userAgent: session.userAgent || null,
      startedAt: session.startedAt,
      lastAccessAt: session.lastAccessAt,
      closedAt: session.closedAt || null,
      closeReason: session.closeReason || null,
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
        ? device.fingerprintHash === currentFingerprintHash
        : false;

    return {
      userTrustedDeviceId: device.userTrustedDeviceId,
      userId: device.userId,
      deviceName: device.deviceName,
      fingerprintHash: device.fingerprintHash,
      isCurrent,
      status: device.status,
      isPending: device.status === 'pending',
      ipAddress: device.ipAddress || null,
      city: device.city || null,
      country: device.country || null,
      countryCode: device.countryCode || null,
      browser: device.browser || null,
      os: device.os || null,
      deviceType: device.deviceType || 'desktop',
      approvedByDeviceId: device.approvedByDeviceId || null,
      approvedAt: device.approvedAt || null,
      blockedByDeviceId: device.blockedByDeviceId || null,
      blockedAt: device.blockedAt || null,
      activeSession,
      trustedAt: device.trustedAt,
      lastSeenAt: device.lastSeenAt,
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
      biometricCredentialId: credential.biometricCredentialId,
      deviceId: credential.userTrustedDeviceId,
      credentialId: credential.credentialId,
      signCount: credential.signCount,
      isActive: credential.isActive,
      lastUsedAt: credential.lastUsedAt || null,
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

export default {
  VerificationCodeComponent,
  UserLoginAttemptComponent,
  ResetCredentialsComponent,
  UserChangeLogComponent,
  BiometricCredentialComponent,
  UserSessionComponent,
  TrustedDeviceComponent
};
