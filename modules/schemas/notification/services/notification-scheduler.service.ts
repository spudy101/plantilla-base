import type * as Types from '../notification.types';
import notificationRepo from '../repositories/notification.repository';
import loggerUtilModule from '../../../../shared/utils/logger.util';
const { logger } = loggerUtilModule;
import errorMessageModule from '../../../../shared/utils/error-message.util';

const { errorMessage } = errorMessageModule;


const DEFAULT_QUIET_HOURS_DELAY_MINUTES = 15;

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

class NotificationSchedulerService {
  notificationRepo: typeof notificationRepo;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new NotificationSchedulerService({ notificationRepo: fake })
   * @param {object} [deps]
   */
  constructor(deps: NotificationSchedulerService.Deps = {}) {
    this.notificationRepo = deps.notificationRepo ?? notificationRepo;
  }

  /**
   * Verifica si estamos en quiet hours
   * @param {Object} userPreference - Preferencias del usuario
   * @returns {boolean}
   */
  isInQuietHours(userPreference: NotificationSchedulerService.Preference) {
    if (!userPreference?.quietHoursStart || !userPreference?.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:00`;

    const start = userPreference.quietHoursStart;
    const end = userPreference.quietHoursEnd;

    // Quiet hours dentro del mismo día (ej: 22:00 - 23:59)
    if (start < end) {
      return currentTime >= start && currentTime < end;
    }

    // Quiet hours cruzan medianoche (ej: 22:00 - 08:00)
    return currentTime >= start || currentTime < end;
  }

  /**
   * Calcula cuándo termina el quiet hours
   * @param {Object} userPreference - Preferencias del usuario
   * @returns {Date}
   */
  calcularFinQuietHours(userPreference: NotificationSchedulerService.Preference) {
    if (!userPreference?.quietHoursEnd) {
      return new Date(Date.now() + DEFAULT_QUIET_HOURS_DELAY_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND); // +15 min por defecto
    }

    const now = new Date();
    const [hours = '0', minutes = '0'] = userPreference.quietHoursEnd.split(':');

    const endTime = new Date(now);
    endTime.setHours(Number.parseInt(hours, 10), Number.parseInt(minutes, 10), 0, 0);

    // Si la hora ya pasó hoy, programar para mañana
    if (endTime <= now) {
      endTime.setDate(endTime.getDate() + 1);
    }

    return endTime;
  }

  /**
   * Programa envío de push para después de quiet hours
   * @param {string} notificationId - ID de la notificación
   * @param {Object} userPreference - Preferencias del usuario
   */
  async programarEnvioPush(notificationId: string, userPreference: NotificationSchedulerService.Preference) {
    const nextRetryAt = this.calcularFinQuietHours(userPreference);

    await this.notificationRepo.update(notificationId, {
      scheduledFor: nextRetryAt,
      pushNextRetryAt: nextRetryAt
    });

    logger.info('Push programado para después de quiet hours', { notificationId, nextRetryAt });
  }

  /**
   * Programa envío de email para después de quiet hours
   * @param {string} notificationId - ID de la notificación
   * @param {Object} userPreference - Preferencias del usuario
   */
  async programarEnvioEmail(notificationId: string, userPreference: NotificationSchedulerService.Preference) {
    const nextRetryAt = this.calcularFinQuietHours(userPreference);

    await this.notificationRepo.update(notificationId, {
      scheduledFor: nextRetryAt,
      emailNextRetryAt: nextRetryAt
    });

    logger.info('Email programado para después de quiet hours', { notificationId, nextRetryAt });
  }

  /**
   * Programa envío de SMS para después de quiet hours
   * @param {string} notificationId - ID de la notificación
   * @param {Object} userPreference - Preferencias del usuario
   */
  async programarEnvioSms(notificationId: string, userPreference: NotificationSchedulerService.Preference) {
    const nextRetryAt = this.calcularFinQuietHours(userPreference);

    await this.notificationRepo.update(notificationId, {
      scheduledFor: nextRetryAt,
      smsNextRetryAt: nextRetryAt
    });

    logger.info('SMS programado para después de quiet hours', { notificationId, nextRetryAt });
  }

  /**
   * Obtiene notificaciones programadas listas para enviar
   * @returns {Promise<Array>}
   */
  async procesarNotificacionesProgramadas() {
    try {
      const scheduled = await this.notificationRepo.findScheduledReady();

      logger.info('Procesando notificaciones programadas', { count: scheduled.length });

      return scheduled;
    } catch (error) {
      logger.warn('Error obteniendo notificaciones programadas', { error: errorMessage(error) });
      throw error;
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace NotificationSchedulerService {
  /** Preferencias del usuario (solo se leen las quiet hours); null/undefined → sin quiet hours. */
  export type Preference = Types.UserPreference;

  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    notificationRepo?: typeof notificationRepo;
  }
}

export default Object.assign(new NotificationSchedulerService(), { NotificationSchedulerService });
