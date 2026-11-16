import notificationRepo = require('../repositories/notification.repository');
import userPushTokenRepo = require('../repositories/user-push-token.repository');
import verificationCodeRepo = require('../repositories/verification-code.repository');
import loggerUtilModule = require('../../../../shared/utils/logger.util');
const { logger } = loggerUtilModule;
import errorMessageModule = require('../../../../shared/utils/error-message.util');

const { errorMessage } = errorMessageModule;


class NotificationCleanupService {
  notificationRepo: typeof notificationRepo;
  userPushTokenRepo: typeof userPushTokenRepo;
  verificationCodeRepo: typeof verificationCodeRepo;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new NotificationCleanupService({ notificationRepo: fake })
   * @param {object} [deps]
   */
  constructor(deps: NotificationCleanupService.Deps = {}) {
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
      logger.warn('Error en limpieza', { error: errorMessage(error) });
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

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace NotificationCleanupService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    notificationRepo?: typeof notificationRepo;
    userPushTokenRepo?: typeof userPushTokenRepo;
    verificationCodeRepo?: typeof verificationCodeRepo;
  }
}

export = Object.assign(new NotificationCleanupService(), { NotificationCleanupService });
