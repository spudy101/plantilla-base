import BaseRepository from '../../../../../shared/repositories/base.repository';
import AppError from '../../../../../shared/utils/app-error.util';
import modelsModule from '../../../../../shared/models';
const { UserBiometricCredential, BiometricChallenge } = modelsModule;
import { Op } from 'sequelize';
import type { CreateOptions } from 'sequelize';
import type defineBiometricChallenge from '../models/biometric-challenge.model';
import type defineUserBiometricCredential from '../models/user-biometric-credential.model';

// TTL del challenge biométrico en milisegundos
const BIOMETRIC_CHALLENGE_TTL_MINUTES = 5;
const BIOMETRIC_CHALLENGE_TTL_MS = BIOMETRIC_CHALLENGE_TTL_MINUTES * 60 * 1000; // 5 minutos

// ============================================================
// BiometricCredentialRepository
// ============================================================

class BiometricCredentialRepository extends BaseRepository<defineUserBiometricCredential.Instance> {
  constructor() {
    super(UserBiometricCredential);
  }

  /**
   * Busca una credencial activa por el credentialId que envía el dispositivo.
   * Usado en login/finish para verificar la firma.
   */
  findByCredentialId(credentialId: string) {
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
  findByUserAndDevice(userId: string, trustedDeviceId: string) {
    return this.findOne({
      user_id: userId,
      user_trusted_device_id: trustedDeviceId,
      is_active: true
    });
  }

  /**
   * Lista todas las credenciales activas de un usuario.
   */
  findAllByUser(userId: string) {
    return this.findAll({ user_id: userId, is_active: true }, { order: [['created_at', 'DESC']] });
  }

  /**
   * Crea una nueva credencial biométrica.
   */
  override create(
    data: defineUserBiometricCredential.CreationAttributes,
    options: CreateOptions<defineUserBiometricCredential.Attributes> = {}
  ) {
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
  updateAfterLogin(credentialId: string, newSignCount: number) {
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
  async deactivate(biometricCredentialId: string) {
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
  deleteByDevice(trustedDeviceId: string) {
    return this.bulkDelete({ user_trusted_device_id: trustedDeviceId });
  }
}

// ============================================================
// BiometricChallengeRepository
// ============================================================

class BiometricChallengeRepository extends BaseRepository<defineBiometricChallenge.Instance> {
  constructor() {
    super(BiometricChallenge);
  }

  /**
   * Crea un challenge con TTL de 5 minutos.
   */
  override create(
    // expires_at y used los fija el repositorio (TTL de 5 min, no usado)
    data: Omit<defineBiometricChallenge.CreationAttributes, 'expires_at' | 'used'>,
    options: CreateOptions<defineBiometricChallenge.Attributes> = {}
  ) {
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
  findValid(challenge: string) {
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
  markAsUsed(challengeId: string) {
    return this.bulkUpdate({ used: true }, { challenge_id: challengeId });
  }

  /**
   * Limpia challenges expirados — puede llamarse en un cron job.
   */
  deleteExpired() {
    return this.bulkDelete({
      expires_at: { [Op.lt]: new Date() }
    });
  }
}

export default {
  biometricCredentialRepository: new BiometricCredentialRepository(),
  biometricChallengeRepository: new BiometricChallengeRepository()
};
