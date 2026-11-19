// Crons de notificaciones:
//   * despachador (cada minuto): envía las entregas vencidas — diferidas por horario de silencio,
//     reintentos, y las que quedaron a medias si el proceso murió. Seguro con varias instancias (cada
//     entrega la toma una sola, FOR UPDATE SKIP LOCKED).
//   * limpiezas diarias (retención de notificaciones leídas y códigos de verificación vencidos).
import cron from 'node-cron';
import notificationDeliveryService from '../services/notification-delivery.service';
import notificationCleanupService from '../services/notification-cleanup.service';
import loggerUtilModule from '../../../shared/observability/logger.util';
const { logger } = loggerUtilModule;
import { runOperation } from '../../../shared/observability/operation';
import errorMessageModule from '../../../shared/utils/error-message.util';
const { errorMessage } = errorMessageModule;

class NotificationWorker {
  static iniciar() {
    // Solo los ciclos con entregas se registran como operación: uno vacío por minuto no deja traza.
    cron.schedule('* * * * *', async () => {
      try {
        const { attempted } = await notificationDeliveryService.dispatchDue(send =>
          runOperation({ source: 'worker', name: 'notification.dispatch' }, send)
        );
        if (attempted > 0) {
          logger.info('Entregas de notificaciones despachadas', { attempted });
        }
      } catch (error) {
        // Falló la toma (p. ej. base no disponible): el próximo ciclo lo vuelve a intentar.
        logger.error('[worker] notification.dispatch no pudo tomar entregas', { error: errorMessage(error) });
      }
    });

    // Limpieza de notificaciones antiguas - diario a las 3 AM
    cron.schedule('0 3 * * *', () =>
      runOperation({ source: 'worker', name: 'notification.cleanup' }, async () => {
        logger.info('Ejecutando worker: limpieza de notificaciones antiguas');
        await notificationCleanupService.limpiarNotificacionesAntiguas();
      })
    );

    // Limpieza de codigos de verificacion - diario a las 4 AM
    cron.schedule('0 4 * * *', () =>
      runOperation({ source: 'worker', name: 'notification.cleanup-codes' }, async () => {
        logger.info('Ejecutando worker: limpieza de codigos de verificacion');
        const result = await notificationCleanupService.limpiarCodigosVerificacion();
        logger.info('Worker limpieza codigos completado', result);
      })
    );

    logger.info('Workers de notificaciones iniciados exitosamente');
  }
}

export default NotificationWorker;
