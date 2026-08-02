const BaseRepository = require('../../../../shared/repositories/base.repository');
const { UserPushToken } = require('../../../../shared/models');
const { Op } = require('sequelize');

class UserPushTokenRepository extends BaseRepository {
  constructor() {
    super(UserPushToken);
  }

  /**
   * Obtiene todos los tokens activos de un usuario
   */
  findActiveByUser(userId) {
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
  findByToken(token) {
    return this.findOne({ token });
  }

  /**
   * Busca token por device_id
   */
  findByDeviceId(deviceId) {
    return this.findOne({ device_id: deviceId });
  }

  /**
   * Crea o actualiza un token (upsert por device_id)
   */
  upsertToken(userId, token, platform, deviceId = null) {
    let existing = null;

    if (deviceId) {
      existing = this.findByDeviceId(deviceId);
    }

    if (!existing) {
      existing = this.findByToken(token);
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
  deactivateToken(tokenId) {
    return this.update(tokenId, { is_active: false });
  }

  /**
   * Desactiva todos los tokens de un usuario
   */
  deactivateAllByUser(userId) {
    return this.bulkUpdate({ is_active: false }, { user_id: userId });
  }

  /**
   * Desactiva tokens por device_id
   */
  deactivateByDeviceId(deviceId) {
    return this.bulkUpdate({ is_active: false }, { device_id: deviceId });
  }

  /**
   * Actualiza last_used_at de un token
   */
  updateLastUsed(tokenId) {
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
      updated_at: { [Op.lt]: cutoffDate }
    });
  }

  /**
   * Cuenta tokens activos por plataforma
   */
  countByPlatform() {
    const { sequelize } = this.model;

    const result = this.model.findAll({
      where: { is_active: true },
      attributes: ['platform', [sequelize.fn('COUNT', sequelize.col('user_push_token_id')), 'count']],
      group: ['platform'],
      raw: true
    });

    return result;
  }

  /**
   * Obtiene tokens activos de múltiples usuarios
   */
  findActiveByUsers(userIds) {
    return this.findAll({
      user_id: { [Op.in]: userIds },
      is_active: true
    });
  }
}

module.exports = new UserPushTokenRepository();
