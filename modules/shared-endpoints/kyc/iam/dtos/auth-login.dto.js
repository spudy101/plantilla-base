const {
  UserComponent,
  PersonComponent,
  PersonContactComponent,
  PersonLocationComponent,
  TrustedDeviceComponent
} = require('../../../../../shared/dtos/kyc');

/**
 * ============================================================
 * AUTH LOGIN DTOs
 * ============================================================
 */

// ============================================================
// LOGIN
// ============================================================

function LoginResponseDTO({ user, tokens, deviceId, includeTokens = true, deviceHmacSecret = null }) {
  const dto = {
    user: UserComponent.build(user, {
      includeRole: true,
      includeAvatar: true
    }),
    deviceId: deviceId || null
  };

  if (user.person) {
    dto.person = PersonComponent.build(user.person, {
      includeGender: true,
      includeContact: false,
      includeLocation: false
    });

    if (user.person.contact) {
      dto.contact = PersonContactComponent.build(user.person.contact);
    }

    if (user.person.location) {
      dto.location = PersonLocationComponent.build(user.person.location);
    }
  }

  if (includeTokens) {
    dto.tokens = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn
    };
  }

  // Secret HMAC único del dispositivo — solo mobile, solo en login exitoso.
  // El mobile lo guarda en su keychain y lo usa para firmar cada request.
  // La web no lo recibe — usa cookies httpOnly, no necesita HMAC.
  if (deviceHmacSecret) {
    dto.hmacSecret = deviceHmacSecret;
  }

  return dto;
}

// ============================================================
// POLICY UPDATE REQUIRED
// ============================================================

/**
 * Se retorna cuando el usuario tiene una versión antigua de la política.
 * No incluye tokens — el usuario debe aceptar y volver a hacer login.
 */
function PolicyUpdateRequiredDTO({ currentVersion, newVersion, documentUrl, summary, effectiveDate }) {
  return {
    requiresPolicyAcceptance: true,
    policy: {
      currentVersion,
      newVersion,
      documentUrl,
      summary: summary || null,
      effectiveDate: effectiveDate || null
    },
    message: 'Hay una nueva versión de la política de privacidad. Debes aceptarla para continuar.'
  };
}

// ============================================================
// DEVICE APPROVAL REQUIRED
// ============================================================

function DeviceApprovalRequiredDTO({ deviceId }) {
  return {
    requiresDeviceApproval: true,
    deviceId,
    message: 'Dispositivo pendiente de aprobación. Apruébalo desde un dispositivo de confianza para continuar.'
  };
}

// ============================================================
// MFA
// ============================================================

function MFARequiredResponseDTO({ username, session, challengeType, preferredMfaMethod }) {
  return {
    requiresMFA: true,
    challengeType,
    preferredMfaMethod,
    username,
    session
  };
}

// ============================================================
// REFRESH TOKEN
// ============================================================

function RefreshTokenResponseDTO({ accessToken, refreshToken, expiresIn }) {
  return { accessToken, refreshToken, expiresIn };
}

// ============================================================
// TRUSTED DEVICES
// ============================================================

// [RF-AUTH-03] | CA-01 | DTO de lista de dispositivos; marca el dispositivo
// actual usando currentFingerprintHash y currentSessionId
function TrustedDeviceListDTO(devices, currentFingerprintHash = null, currentSessionId = null) {
  const built = TrustedDeviceComponent.buildArray(devices, currentFingerprintHash, currentSessionId);
  return {
    devices: built,
    total: built.length
  };
}

function TrustedDeviceUpdateDTO(device) {
  return {
    userTrustedDeviceId: device.user_trusted_device_id,
    deviceName: device.device_name,
    status: device.status,
    updatedAt: device.updatedAt
  };
}

module.exports = {
  LoginResponseDTO,
  PolicyUpdateRequiredDTO,
  DeviceApprovalRequiredDTO,
  MFARequiredResponseDTO,
  RefreshTokenResponseDTO,
  TrustedDeviceListDTO,
  TrustedDeviceUpdateDTO
};
