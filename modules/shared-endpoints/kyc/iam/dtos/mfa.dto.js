/**
 * ============================================================
 * MFA DTOs — CLIENT
 * ============================================================
 * DTOs simples — no usan componentes del shared porque
 * no mapean directamente a entidades de BD.
 */

function TOTPSetupResponseDTO({ otpauthUrl, secretCode, username }) {
  return {
    otpauthUrl,
    secretCode,
    username,
    instructions:
      'Escanea el código QR con tu aplicación de autenticación ' +
      '(Google Authenticator, Authy, etc.) y verifica el código generado para activar TOTP.'
  };
}

function TOTPActivationResponseDTO({ userId, username, totpEnabled }) {
  return { userId, username, totpEnabled };
}

function TOTPVerificationResponseDTO({ valid, username }) {
  return { valid, username };
}

function PasswordValidationResponseDTO({ valid, username }) {
  return { valid, username };
}

function SMSMFAActivationResponseDTO({ userId, username, smsMfaEnabled }) {
  return { userId, username, smsMfaEnabled };
}

function PreferredMethodResponseDTO({ userId, username, preferredMfaMethod }) {
  return { userId, username, preferredMfaMethod };
}

function MFAStatusResponseDTO({ userId, username, totpEnabled, smsMfaEnabled, preferredMfaMethod }) {
  return { userId, username, totpEnabled, smsMfaEnabled, preferredMfaMethod };
}

function SMSActivationRequestResponseDTO({ verificationCodeId, expiresAt, truncatedCode }) {
  return { verificationCodeId, expiresAt, truncatedCode };
}

module.exports = {
  TOTPSetupResponseDTO,
  TOTPActivationResponseDTO,
  TOTPVerificationResponseDTO,
  PasswordValidationResponseDTO,
  SMSMFAActivationResponseDTO,
  SMSActivationRequestResponseDTO,
  MFAStatusResponseDTO,
  PreferredMethodResponseDTO
};
