import type defineNotification = require('../models/notification.model');
import notificationRepo = require('../repositories/notification.repository');
import notificationTypeRepo = require('../repositories/notification-type.repository');
import integrationApiLogRepo = require('../../integration/repositories/integration-api-log.repository');
import notificationSendingService = require('./notification-sending.service');
import loggerUtilModule = require('../../../../shared/utils/logger.util');
const { logger } = loggerUtilModule;
import awsErrorCodesModule = require('../../../../shared/constants/aws-error-codes');
const { isHardBounce } = awsErrorCodesModule;
import errorMessageModule = require('../../../../shared/utils/error-message.util');

const { errorMessage } = errorMessageModule;


// El producto de integración bajo el que cada canal registra su envío en integration_api_logs.
// SMS no está mapeado a propósito: no hay clasificación de hard bounce para SMS (SNS no expone un
// código terminal equivalente), así que reintenta hasta agotar el tope como cualquier fallo temporal.
const CHANNEL_PRODUCT: Record<string, 'ses' | 'sns' | undefined> = { email: 'ses', push: 'sns' };

class NotificationRetryService {
  notificationRepo: typeof notificationRepo;
  notificationTypeRepo: typeof notificationTypeRepo;
  integrationApiLogRepo: typeof integrationApiLogRepo;
  notificationSendingService: typeof notificationSendingService;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new NotificationRetryService({ notificationRepo: fake })
   * @param {object} [deps]
   */
  constructor(deps: NotificationRetryService.Deps = {}) {
    this.notificationRepo = deps.notificationRepo ?? notificationRepo;
    this.notificationTypeRepo = deps.notificationTypeRepo ?? notificationTypeRepo;
    this.integrationApiLogRepo = deps.integrationApiLogRepo ?? integrationApiLogRepo;
    this.notificationSendingService = deps.notificationSendingService ?? notificationSendingService;
  }

  /**
   * Decide si un canal fallido es un hard bounce (buzón/endpoint muerto) y, de serlo, lo cierra.
   * Lee el error_code del ÚLTIMO intento de esa notificación en integration_api_logs (correlacionado
   * por notification_id + product) y lo clasifica con isHardBounce(). Al cerrar deja *_error seteado
   * y *_next_retry_at = null (señal canónica que hace que findPending*Retries deje de seleccionarlo y
   * que el reenvío manual del admin también lo rechace). Devuelve true si cerró el canal.
   * @private
   */
  // eslint-disable-next-line class-methods-use-this
  async _esHardBounceYCerrar(notification: Pick<defineNotification.Instance, 'notification_id'>, channel: string) {
    const product = CHANNEL_PRODUCT[channel];
    if (!product) {
      return false;
    }

    const lastLog = await this.integrationApiLogRepo.findLatestByNotification(notification.notification_id, product);
    if (!lastLog || !isHardBounce(channel, lastLog.error_code)) {
      return false;
    }

    const reason = `hard_bounce:${lastLog.error_code}`;
    if (channel === 'email') {
      await this.notificationRepo.markEmailPermanentFailure(notification.notification_id, reason);
    } else {
      await this.notificationRepo.markPushPermanentFailure(notification.notification_id, reason);
    }

    logger.info('Canal cerrado por hard bounce', {
      notificationId: notification.notification_id,
      channel,
      errorCode: lastLog.error_code
    });
    return true;
  }

  /**
   * Reintentar envíos fallidos de push (salvo hard bounce → se cierran).
   */
  async reintentarEnviosPush() {
    try {
      const pending = await this.notificationRepo.findPendingPushRetries();
      logger.info('Reintentando envíos de push pendientes', { count: pending.length });

      let reintentadas = 0;
      let cerradas = 0;
      for (const notification of pending) {
        if (await this._esHardBounceYCerrar(notification, 'push')) {
          cerradas++;
          continue;
        }
        await this.notificationSendingService.enviarPushIndividual(
          notification.user_id,
          notification.title,
          notification.body,
          (notification.metadata as Record<string, unknown> | null) || {},
          notification.notification_id
        );
        reintentadas++;
      }

      logger.info('Reintentos de push completados', { reintentadas, cerradas });
      return { reintentadas, cerradas };
    } catch (error) {
      logger.warn('Error al reintentar push', { error: errorMessage(error) });
      throw error;
    }
  }

  /**
   * Reintentar envíos fallidos de email (salvo hard bounce → se cierran).
   */
  async reintentarEnviosEmail() {
    try {
      const pending = await this.notificationRepo.findPendingEmailRetries();
      logger.info('Reintentando envíos de email pendientes', { count: pending.length });

      let reintentadas = 0;
      let cerradas = 0;
      for (const notification of pending) {
        if (await this._esHardBounceYCerrar(notification, 'email')) {
          cerradas++;
          continue;
        }
        const notificationType = await this.notificationTypeRepo.findById(notification.notification_type_id);
        if (notificationType) {
          await this.notificationSendingService.enviarEmailIndividual(
            notification.user_id,
            notificationType,
            (notification.metadata as Record<string, unknown> | null) || {},
            notification.notification_id
          );
          reintentadas++;
        }
      }

      logger.info('Reintentos de email completados', { reintentadas, cerradas });
      return { reintentadas, cerradas };
    } catch (error) {
      logger.warn('Error al reintentar email', { error: errorMessage(error) });
      throw error;
    }
  }

  /**
   * Reintentar envíos fallidos de SMS (salvo hard bounce → se cierran).
   */
  async reintentarEnviosSms() {
    try {
      const pending = await this.notificationRepo.findPendingSmsRetries();
      logger.info('Reintentando envíos de SMS pendientes', { count: pending.length });

      let reintentadas = 0;
      let cerradas = 0;
      for (const notification of pending) {
        if (await this._esHardBounceYCerrar(notification, 'sms')) {
          cerradas++;
          continue;
        }
        await this.notificationSendingService.enviarSmsIndividual(
          notification.user_id,
          notification.body,
          (notification.metadata as Record<string, unknown> | null) || {},
          notification.notification_id
        );
        reintentadas++;
      }

      logger.info('Reintentos de SMS completados', { reintentadas, cerradas });
      return { reintentadas, cerradas };
    } catch (error) {
      logger.warn('Error al reintentar SMS', { error: errorMessage(error) });
      throw error;
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace NotificationRetryService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    notificationRepo?: typeof notificationRepo;
    notificationTypeRepo?: typeof notificationTypeRepo;
    integrationApiLogRepo?: typeof integrationApiLogRepo;
    notificationSendingService?: typeof notificationSendingService;
  }
}

export = Object.assign(new NotificationRetryService(), { NotificationRetryService });
