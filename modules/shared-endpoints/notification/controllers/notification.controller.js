const NotificationService = require('../services/notification.service');
const NotificationEmitter = require('../../../schemas/notification/utils/notification-emitter.util');
const ApiResponse = require('../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../shared/middlewares/error.middleware');
const { logger } = require('../../../../shared/utils/logger.util');
const {
  NotificationsListResponseDTO,
  PersonalNotificationsResponseDTO,
  GlobalNotificationsResponseDTO,
  UnreadCountResponseDTO
} = require('../dtos/notification.dto');

// Intervalo del keepalive del stream SSE (ms). 25 s < idle timeout típico de ALB/nginx (60 s).
const SSE_HEARTBEAT_MS = 25000;

class NotificationController {
  /** GET /notifications/count/stream — SSE: emite { count } en tiempo real */
  streamUnreadCount = async (req, res) => {
    const { userId } = req.user;

    res.setHeader('Content-Type', 'text/event-stream');
    // no-transform → el middleware de compresión global no comprime/bufferea el stream
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Evita el buffering del reverse proxy (nginx/ALB) que retiene los eventos SSE
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const initialCount = await NotificationService.getUnreadCount(userId);
      res.write(`data: ${JSON.stringify({ count: initialCount })}\n\n`);
    } catch (err) {
      logger.error('SSE initial count error', { error: err.message, userId });
      res.write(`data: ${JSON.stringify({ count: 0 })}\n\n`);
    }

    const handler = event => {
      // Broadcast de notificación global (una sola fila para todos, sin fan-out por usuario):
      // cada conexión abierta recalcula su propio contador. Costo: 2 queries por conexión activa.
      if (event?.global === true) {
        NotificationService.computeUnreadCount(userId)
          .then(count => res.write(`data: ${JSON.stringify({ count })}\n\n`))
          .catch(err => logger.error('SSE global count refresh error', { error: err.message, userId }));
        return;
      }
      if (event?.userId === userId) {
        res.write(`data: ${JSON.stringify({ count: event.count })}\n\n`);
      }
    };

    NotificationEmitter.on('count-updated', handler);
    logger.info('SSE stream abierto', { userId, localListeners: NotificationEmitter.listenerCount('count-updated') });

    // Heartbeat: en periodos sin eventos la conexión queda idle y el reverse proxy (ALB/nginx, idle
    // timeout típico 60 s) la cierra en silencio → el contador se congela hasta que el front reconecte.
    // Un comentario SSE (`: ping`) cada 25 s la mantiene viva; el cliente lo ignora (no es un `data:`).
    const heartbeat = setInterval(() => res.write(': ping\n\n'), SSE_HEARTBEAT_MS);

    req.on('close', () => {
      clearInterval(heartbeat);
      NotificationEmitter.off('count-updated', handler);
      logger.info('SSE stream cerrado', { userId, localListeners: NotificationEmitter.listenerCount('count-updated') });
    });
  };

  /** GET /notifications/count */
  getUnreadCount = asyncHandler(async (req, res) => {
    const result = await NotificationService.getUnreadCount(req.user.userId);
    return ApiResponse.success(res, 'Conteo de notificaciones no leídas obtenido exitosamente', UnreadCountResponseDTO(result));
  });

  /** POST / — autenticación externa (X-API-Key) */
  createNotification = asyncHandler(async (req, res) => {
    const result = await NotificationService.createNotification(req.body, {}, req.externalService);
    return ApiResponse.success(res, 'Notificación creada exitosamente', result, 201);
  });

  /** GET /notifications/ — personal + global mezcladas y paginadas */
  getNotificationsList = asyncHandler(async (req, res) => {
    const result = await NotificationService.getNotificationsList(req.user.userId, req.query);
    return ApiResponse.success(res, 'Notificaciones obtenidas exitosamente', NotificationsListResponseDTO(result));
  });

  /** GET /notifications/personal */
  getPersonalNotifications = asyncHandler(async (req, res) => {
    const result = await NotificationService.getPersonalNotifications(req.user.userId, req.query);
    return ApiResponse.success(res, 'Notificaciones personales obtenidas exitosamente', PersonalNotificationsResponseDTO(result));
  });

  /** GET /notifications/global */
  getGlobalNotifications = asyncHandler(async (req, res) => {
    const result = await NotificationService.getGlobalNotifications(req.user.userId, req.query);
    return ApiResponse.success(res, 'Notificaciones globales obtenidas exitosamente', GlobalNotificationsResponseDTO(result));
  });
}

module.exports = new NotificationController();
