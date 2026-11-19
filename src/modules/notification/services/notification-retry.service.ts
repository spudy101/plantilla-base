import type { Notification } from '../../../shared/database/generated/prisma/client';
import notificationRepo from '../repositories/notification.repository';
import notificationTypeRepo from '../repositories/notification-type.repository';
import notificationSendingService from './notification-sending.service';
import loggerUtilModule from '../../../shared/observability/logger.util';
const { logger } = loggerUtilModule;
import awsErrorCodesModule from '../../../shared/constants/aws-error-codes';
const { isHardBounce } = awsErrorCodesModule;
import errorMessageModule from '../../../shared/utils/error-message.util';

const { errorMessage } = errorMessageModule;


// Código del proveedor del último fallo de cada canal, guardado en la notificación al fallar el envío.
// SMS no tiene a propósito: no hay clasificación de hard bounce para SMS (SNS no expone un código
// terminal equivalente), así que reintenta hasta agotar el tope como cualquier fallo temporal.
type ErrorCodes = Pick<Notification, 'notificationId' | 'emailErrorCode' | 'pushErrorCode'>;
const LAST_ERROR_CODE: Record<string, ((n: ErrorCodes) => string | null) | undefined> = {
  email: n => n.emailErrorCode,
  push: n => n.pushErrorCode
};

class NotificationRetryService {
  notificationRepo: typeof notificationRepo;
  notificationTypeRepo: typeof notificationTypeRepo;
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
    this.notificationSendingService = deps.notificationSendingService ?? notificationSendingService;
  }

  /**
   * Decide si un canal fallido es un hard bounce (buzón/endpoint muerto) y, de serlo, lo cierra.
   * Lee el código del proveedor del último fallo, guardado en la notificación (email_error_code /
   * push_error_code), y lo clasifica con isHardBounce(). Al cerrar deja *_error seteado
   * y *_next_retry_at = null (señal canónica que hace que findPending*Retries deje de seleccionarlo y
   * que el reenvío manual del admin también lo rechace). Devuelve true si cerró el canal.
   * @private
   */
  // eslint-disable-next-line class-methods-use-this
  async _esHardBounceYCerrar(notification: ErrorCodes, channel: string) {
    const errorCode = LAST_ERROR_CODE[channel]?.(notification) ?? null;
    if (!errorCode || !isHardBounce(channel, errorCode)) {
      return false;
    }

    const reason = `hard_bounce:${errorCode}`;
    if (channel === 'email') {
      await this.notificationRepo.markEmailPermanentFailure(notification.notificationId, reason);
    } else {
      await this.notificationRepo.markPushPermanentFailure(notification.notificationId, reason);
    }

    logger.info('Canal cerrado por hard bounce', {
      notificationId: notification.notificationId,
      channel,
      errorCode
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
          notification.userId,
          notification.title,
          notification.body,
          (notification.metadata as Record<string, unknown> | null) || {},
          notification.notificationId
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
        const notificationType = notification.notificationTypeId ? await this.notificationTypeRepo.findById(notification.notificationTypeId) : null;
        if (notificationType) {
          await this.notificationSendingService.enviarEmailIndividual(
            notification.userId,
            notificationType,
            (notification.metadata as Record<string, unknown> | null) || {},
            notification.notificationId
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
          notification.userId,
          notification.body,
          (notification.metadata as Record<string, unknown> | null) || {},
          notification.notificationId
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
    notificationSendingService?: typeof notificationSendingService;
  }
}

export default Object.assign(new NotificationRetryService(), { NotificationRetryService });
