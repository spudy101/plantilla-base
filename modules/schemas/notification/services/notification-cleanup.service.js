const notificationRepo = require('../repositories/notification.repository');
const userPushTokenRepo = require('../repositories/user-push-token.repository');
const verificationCodeRepo = require('../repositories/verification-code.repository');
const { logger } = require('../../../../shared/utils/logger.util');

class NotificationCleanupService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new NotificationCleanupService({ notificationRepo: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.notificationRepo = deps.notificationRepo ?? notificationRepo;
    this.userPushTokenRepo = deps.userPushTokenRepo ?? userPushTokenRepo;
    this.verificationCodeRepo = deps.verificationCodeRepo ?? verificationCodeRepo;
  }

  /**
   * Limpieza de notificaciones antiguas y tokens inactivos
   * @param {number} days - Días de antigüedad (por defecto 90)
   */
  async limpiarNotificacionesAntiguas(days = 90) {
    try {
      const deletedNotifications = await this.notificationRepo.deleteOldRead(days);
      const deletedTokens = await this.userPushTokenRepo.deleteOldInactive(days);

      logger.info('Limpieza completada', {
        notificaciones_eliminadas: deletedNotifications,
        tokens_eliminados: deletedTokens
      });

      return {
        notificaciones_eliminadas: deletedNotifications,
        tokens_eliminados: deletedTokens
      };
    } catch (error) {
      logger.warn('Error en limpieza', { error: error.message });
      throw error;
    }
  }
  async limpiarCodigosVerificacion(retentionDays = 30) {
    const deletedExpired = await this.verificationCodeRepo.deleteExpired();
    const deletedVerified = await this.verificationCodeRepo.deleteOldVerified(retentionDays);

    logger.info('Limpieza de codigos de verificacion completada', {
      expirados_eliminados: deletedExpired,
      verificados_eliminados: deletedVerified,
      retencion_dias: retentionDays
    });

    return { expirados_eliminados: deletedExpired, verificados_eliminados: deletedVerified };
  }
}

module.exports = new NotificationCleanupService();
module.exports.NotificationCleanupService = NotificationCleanupService;
