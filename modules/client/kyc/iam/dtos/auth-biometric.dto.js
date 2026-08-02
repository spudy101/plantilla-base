// modules/client/kyc/dtos/auth-biometric.dto.js

const { BiometricCredentialComponent } = require('../../../../../shared/dtos/kyc');

/**
 * ============================================================
 * AUTH BIOMETRIC DTOs — CLIENT
 * ============================================================
 */

function BiometricRegisterStartDTO({ challenge, deviceId, algorithm }) {
  return { challenge, deviceId, algorithm };
}

function BiometricRegisterFinishDTO(credential) {
  const built = BiometricCredentialComponent.build(credential);
  if (!built) {
    return null;
  }
  return {
    biometricCredentialId: built.biometricCredentialId,
    credentialId: built.credentialId,
    deviceId: built.deviceId,
    createdAt: built.createdAt
  };
}

function BiometricLoginStartDTO({ challenge, userId }) {
  return { challenge, userId };
}

const BiometricCredentialDTO = credential => BiometricCredentialComponent.build(credential);

function BiometricCredentialListDTO(credentials) {
  const list = BiometricCredentialComponent.buildArray(credentials);
  return { credentials: list, total: list.length };
}

module.exports = {
  BiometricRegisterStartDTO,
  BiometricRegisterFinishDTO,
  BiometricLoginStartDTO,
  BiometricCredentialDTO,
  BiometricCredentialListDTO
};
