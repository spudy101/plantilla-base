// notificationWorker.js

import cron = require('node-cron');
import notificationSchedulerService = require('../services/notification-scheduler.service');
import notificationSendingService = require('../services/notification-sending.service');
import notificationRetryService = require('../services/notification-retry.service');
import notificationCleanupService = require('../services/notification-cleanup.service');
import loggerUtilModule = require('../../../../shared/utils/logger.util');
const { logger } = loggerUtilModule;
import requestContext = require('../../../../shared/utils/request-context.util');

class NotificationWorker {
  /**
   * Inicia todos los workers de notificaciones
   */
  static iniciar() {
    // Procesar notificaciones programadas cada 5 minutos
    cron.schedule('*/5 * * * *', () =>
      requestContext.runAsWorker('notification.scheduled', async () => {
        logger.info('Ejecutando worker: procesar notificaciones programadas');

        const scheduled = await notificationSchedulerService.procesarNotificacionesProgramadas();

        for (const notification of scheduled) {
          await notificationSendingService.procesarNotificacionProgramada(notification);
        }

        logger.info('Notificaciones programadas procesadas', {
          count: scheduled.length
        });
      })
    );

    // Reintentar push fallidos cada 10 minutos
    cron.schedule('*/10 * * * *', () =>
      requestContext.runAsWorker('notification.push-retry', async () => {
        logger.info('Ejecutando worker: reintentar push fallidos');
        await notificationRetryService.reintentarEnviosPush();
      })
    );

    // Reintentar emails fallidos cada 15 minutos
    cron.schedule('*/15 * * * *', () =>
      requestContext.runAsWorker('notification.email-retry', async () => {
        logger.info('Ejecutando worker: reintentar emails fallidos');
        await notificationRetryService.reintentarEnviosEmail();
      })
    );

    // Reintentar SMS fallidos cada 15 minutos (offset :05/:20/:35/:50 para no colisionar con email/push)
    cron.schedule('5-59/15 * * * *', () =>
      requestContext.runAsWorker('notification.sms-retry', async () => {
        logger.info('Ejecutando worker: reintentar SMS fallidos');
        await notificationRetryService.reintentarEnviosSms();
      })
    );

    // Limpieza de notificaciones antiguas - diario a las 3 AM
    cron.schedule('0 3 * * *', () =>
      requestContext.runAsWorker('notification.cleanup', async () => {
        logger.info('Ejecutando worker: limpieza de notificaciones antiguas');
        await notificationCleanupService.limpiarNotificacionesAntiguas();
      })
    );

    // Limpieza de codigos de verificacion - diario a las 4 AM
    cron.schedule('0 4 * * *', () =>
      requestContext.runAsWorker('notification.cleanup-codes', async () => {
        logger.info('Ejecutando worker: limpieza de codigos de verificacion');
        const result = await notificationCleanupService.limpiarCodigosVerificacion();
        logger.info('Worker limpieza codigos completado', result);
      })
    );

    logger.info('Workers de notificaciones iniciados exitosamente');
  }
}

export = NotificationWorker;
