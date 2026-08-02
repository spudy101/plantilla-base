const BaseRepository = require('../../../../../shared/repositories/base.repository');
const AppError = require('../../../../../shared/utils/app-error.util');
const { UserBiometricCredential } = require('../../../../../shared/models');
const { BiometricChallenge } = require('../../../../../shared/models');

// TTL del challenge biométrico en milisegundos
const BIOMETRIC_CHALLENGE_TTL_MINUTES = 5;
const BIOMETRIC_CHALLENGE_TTL_MS = BIOMETRIC_CHALLENGE_TTL_MINUTES * 60 * 1000; // 5 minutos

// ============================================================
// BiometricCredentialRepository
// ============================================================

class BiometricCredentialRepository extends BaseRepository {
  constructor() {
    super(UserBiometricCredential);
  }

  /**
   * Busca una credencial activa por el credentialId que envía el dispositivo.
   * Usado en login/finish para verificar la firma.
   */
  findByCredentialId(credentialId) {
    return this.findOne({
      credential_id: credentialId,
      is_active: true
    });
  }

  /**
   * Busca credencial activa por usuario + dispositivo.
   * Usado para verificar que el dispositivo ya tiene huella registrada
   * antes de permitir un nuevo registro.
   */
  findByUserAndDevice(userId, trustedDeviceId) {
    return this.findOne({
      user_id: userId,
      user_trusted_device_id: trustedDeviceId,
      is_active: true
    });
  }

  /**
   * Lista todas las credenciales activas de un usuario.
   */
  findAllByUser(userId) {
    return this.findAll({ user_id: userId, is_active: true }, { order: [['created_at', 'DESC']] });
  }

  /**
   * Crea una nueva credencial biométrica.
   */
  create(data, options = {}) {
    return super.create(
      {
        user_id: data.user_id,
        user_trusted_device_id: data.user_trusted_device_id,
        credential_id: data.credential_id,
        public_key: data.public_key,
        sign_count: data.sign_count || 0,
        is_active: true
      },
      options
    );
  }

  /**
   * Actualiza sign_count y last_used_at después de un login exitoso.
   * El sign_count debe ser siempre mayor al anterior — protección anti-replay.
   */
  updateAfterLogin(credentialId, newSignCount) {
    return this.bulkUpdate(
      {
        sign_count: newSignCount,
        last_used_at: new Date()
      },
      { credential_id: credentialId }
    );
  }

  /**
   * Desactiva una credencial (soft delete).
   */
  async deactivate(biometricCredentialId) {
    const credential = await this.findById(biometricCredentialId);
    if (!credential) {
      throw AppError.notFound('Credencial biométrica no encontrada');
    }
    return credential.update({ is_active: false });
  }

  /**
   * Elimina físicamente una credencial.
   * Llamar cuando el usuario elimina el dispositivo asociado.
   */
  deleteByDevice(trustedDeviceId) {
    return this.bulkDelete({ user_trusted_device_id: trustedDeviceId });
  }
}

// ============================================================
// BiometricChallengeRepository
// ============================================================

class BiometricChallengeRepository extends BaseRepository {
  constructor() {
    super(BiometricChallenge);
  }

  /**
   * Crea un challenge con TTL de 5 minutos.
   */
  create(data, options = {}) {
    return super.create(
      {
        user_id: data.user_id || null,
        challenge: data.challenge,
        type: data.type,
        used: false,
        expires_at: new Date(Date.now() + BIOMETRIC_CHALLENGE_TTL_MS)
      },
      options
    );
  }

  /**
   * Busca un challenge válido: mismo valor, no usado y no expirado.
   */
  findValid(challenge) {
    const { Op } = require('sequelize');
    return this.findOne({
      challenge,
      used: false,
      expires_at: { [Op.gt]: new Date() }
    });
  }

  /**
   * Marca el challenge como usado — llamar justo antes de procesar la firma.
   * Impide que el mismo challenge se use dos veces (replay attack).
   */
  markAsUsed(challengeId) {
    return this.bulkUpdate({ used: true }, { challenge_id: challengeId });
  }

  /**
   * Limpia challenges expirados — puede llamarse en un cron job.
   */
  deleteExpired() {
    const { Op } = require('sequelize');
    return this.bulkDelete({
      expires_at: { [Op.lt]: new Date() }
    });
  }
}

module.exports = {
  biometricCredentialRepository: new BiometricCredentialRepository(),
  biometricChallengeRepository: new BiometricChallengeRepository()
};
