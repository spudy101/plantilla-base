import BaseRepository = require('../../../../shared/repositories/base.repository');
import modelsModule = require('../../../../shared/models');
const { UserPushToken } = modelsModule;
import sequelizeModule = require('sequelize');
const { Op, fn, col } = sequelizeModule;
import type defineUserPushToken = require('../models/user-push-token.model');

class UserPushTokenRepository extends BaseRepository<defineUserPushToken.Instance> {
  constructor() {
    super(UserPushToken);
  }

  /**
   * Obtiene todos los tokens activos de un usuario
   */
  findActiveByUser(userId: string) {
    return this.findAll({
      user_id: userId,
      is_active: true
    });
  }

  /**
   * Obtiene todos los tokens activos del sistema
   */
  findAllActive() {
    return this.findAll({ is_active: true }, { order: [['last_used_at', 'DESC']] });
  }

  /**
   * Busca token por el token string
   */
  findByToken(token: string) {
    return this.findOne({ token });
  }

  /**
   * Busca token por device_id
   */
  findByDeviceId(deviceId: string) {
    return this.findOne({ device_id: deviceId });
  }

  /**
   * Crea o actualiza un token (upsert por device_id)
   */
  async upsertToken(
    userId: string,
    token: string,
    platform: defineUserPushToken.Attributes['platform'],
    deviceId: string | null = null
  ) {
    // Antes faltaban los await: existing era siempre una Promise (truthy) y existing.update() reventaba.
    let existing: defineUserPushToken.Instance | null = null;

    if (deviceId) {
      existing = await this.findByDeviceId(deviceId);
    }

    if (!existing) {
      existing = await this.findByToken(token);
    }

    if (existing) {
      return existing.update({
        user_id: userId,
        token,
        platform,
        device_id: deviceId,
        is_active: true,
        last_used_at: new Date()
      });
    }

    return this.create({
      user_id: userId,
      token,
      platform,
      device_id: deviceId,
      is_active: true,
      last_used_at: new Date()
    });
  }

  /**
   * Desactiva un token
   */
  deactivateToken(tokenId: string) {
    return this.update(tokenId, { is_active: false });
  }

  /**
   * Desactiva todos los tokens de un usuario
   */
  deactivateAllByUser(userId: string) {
    return this.bulkUpdate({ is_active: false }, { user_id: userId });
  }

  /**
   * Desactiva tokens por device_id
   */
  deactivateByDeviceId(deviceId: string) {
    return this.bulkUpdate({ is_active: false }, { device_id: deviceId });
  }

  /**
   * Actualiza last_used_at de un token
   */
  updateLastUsed(tokenId: string) {
    return this.update(tokenId, {
      last_used_at: new Date()
    });
  }

  /**
   * Elimina tokens inactivos antiguos (limpieza)
   */
  deleteOldInactive(daysOld = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return this.bulkDelete({
      is_active: false,
      updatedAt: { [Op.lt]: cutoffDate }
    });
  }

  /**
   * Cuenta tokens activos por plataforma
   */
  countByPlatform() {
    const result = this.model.findAll({
      where: { is_active: true },
      attributes: ['platform', [fn('COUNT', col('user_push_token_id')), 'count']],
      group: ['platform'],
      raw: true
    });

    return result;
  }

  /**
   * Obtiene tokens activos de múltiples usuarios
   */
  findActiveByUsers(userIds: string[]) {
    return this.findAll({
      user_id: { [Op.in]: userIds },
      is_active: true
    });
  }
}

export = new UserPushTokenRepository();
