const EncryptionUtil = require('../../utils/encryption.util');
const MaskingUtil = require('../../utils/masking.util');

function _buildUserRef(user) {
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
  static build(verificationCode) {
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
  static build(attempt) {
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

  static buildArray(attempts) {
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
  static build(resetCredential, includeToken = false) {
    if (!resetCredential) {
      return null;
    }

    const dto = {
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

function _maskLogValue(value, changeType) {
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
  static build(log) {
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
      createdAt: log.created_at
    };
  }

  static buildArray(logs) {
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
  static build(session) {
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

  static buildArray(sessions) {
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
  static build(device, currentFingerprintHash = null, currentSessionId = null) {
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

  static buildArray(devices, currentFingerprintHash = null, currentSessionId = null) {
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
  static build(credential) {
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

  static buildArray(credentials) {
    if (!credentials || credentials.length === 0) {
      return [];
    }
    return credentials.map(c => BiometricCredentialComponent.build(c)).filter(Boolean);
  }
}

module.exports = {
  VerificationCodeComponent,
  UserLoginAttemptComponent,
  ResetCredentialsComponent,
  UserChangeLogComponent,
  BiometricCredentialComponent,
  UserSessionComponent,
  TrustedDeviceComponent
};
