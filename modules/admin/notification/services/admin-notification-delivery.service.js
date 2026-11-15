// NOTA DE UBICACIÓN (cross-dominio): este panel vive en modules/admin/notification/ pero NO tiene
// modelo/tabla propia: es una vista de auditoría/observabilidad de ENTREGAS de notificaciones
// (delivery status, fallos, reintentos, métricas) respaldada por la tabla `notifications` del
// dominio schemas/notification. Su carácter es de oversight, no de negocio.
const notificationRepo = require('../../../schemas/notification/repositories/notification.repository');
const notificationTypeRepo = require('../../../schemas/notification/repositories/notification-type.repository');
const notificationSendingService = require('../../../schemas/notification/services/notification-sending.service');
const NotificationCreationService = require('../../../schemas/notification/services/notification-creation.service');
const PaginationHelper = require('../../../../shared/utils/pagination.util');
const { MetadataDTO } = require('../../../../shared/dtos/kyc/components-catalog.dto');
const AppError = require('../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../shared/utils/logger.util');
const { notifications } = require('../../../../shared/constants');
const { Notification } = require('../../../../shared/models');
const {
  NotificationDeliveryListDTO,
  NotificationDeliveryDetailDTO,
  NotificationDeliveryMetricsDTO
} = require('../dtos/admin-notification-delivery.dto');

class AdminNotificationDeliveryService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new AdminNotificationDeliveryService({ notificationRepo: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.notificationRepo = deps.notificationRepo ?? notificationRepo;
    this.notificationTypeRepo = deps.notificationTypeRepo ?? notificationTypeRepo;
    this.notificationSendingService = deps.notificationSendingService ?? notificationSendingService;
    this.NotificationCreationService = deps.NotificationCreationService ?? NotificationCreationService;
  }

  async list(query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const filters = {
      processingStatus: query.processingStatus || null,
      channel: query.channel || null,
      userId: query.userId || null,
      from: query.from || null,
      to: query.to || null,
      onlyCritical: query.onlyCritical || null
    };

    const { rows, count } = await this.notificationRepo.findAllForAdmin(filters, paginationParams);

    logAudit(
      'NOTIFICATION_DELIVERY_LIST_VIEWED',
      adminUserId,
      { totalItems: count },
      { entityType: 'Notification', entityTable: 'notifications' }
    );

    const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== null));

    return {
      data: rows.map(NotificationDeliveryListDTO),
      metadata: MetadataDTO.build({
        totalItems: count,
        page: paginationParams.page,
        limit: paginationParams.limit,
        sortBy: paginationParams.sortBy,
        order: paginationParams.order,
        filters: Object.keys(activeFilters).length > 0 ? activeFilters : undefined
      })
    };
  }

  async metrics(query, adminUserId) {
    const range = { from: query.from || null, to: query.to || null };
    const rows = await this.notificationRepo.deliveryMetrics({
      from: range.from,
      to: range.to,
      userId: query.userId || null
    });

    const result = NotificationDeliveryMetricsDTO(rows, range);

    logAudit(
      'NOTIFICATION_DELIVERY_METRICS_VIEWED',
      adminUserId,
      { total: result.total, from: range.from, to: range.to },
      { entityType: 'Notification', entityTable: 'notifications' }
    );

    return result;
  }

  async getById(notificationId, adminUserId) {
    const record = await this.notificationRepo.findByIdWithType(notificationId);
    if (!record) {
      throw AppError.notFound('Notificación no encontrada');
    }

    logAudit(
      'NOTIFICATION_DELIVERY_VIEWED',
      adminUserId,
      { notificationId },
      { entityId: notificationId, entityType: 'Notification', entityTable: 'notifications' }
    );

    return NotificationDeliveryDetailDTO(record);
  }

  async retry(notificationId, channel = 'all', adminUserId) {
    const notification = await this.notificationRepo.findByIdWithType(notificationId);
    if (!notification) {
      throw AppError.notFound('Notificación no encontrada');
    }

    if (notification.processing_status === Notification.PROCESSING_STATUS.COMPLETED) {
      throw AppError.badRequest('La notificación ya fue entregada exitosamente en todos los canales');
    }

    // Determinar qué canal reintentar basado en lo que falló
    const effectiveChannel = _resolverCanal(notification, channel);
    if (!effectiveChannel) {
      throw AppError.badRequest('No hay canales con error pendiente de reintento para esta notificación');
    }

    // Resetear el mismo registro en lugar de crear uno nuevo
    await this.notificationRepo.resetForRetry(notificationId, effectiveChannel);

    logAudit(
      'NOTIFICATION_DELIVERY_RETRY_REQUESTED',
      adminUserId,
      { notificationId, channel: effectiveChannel },
      { entityId: notificationId, entityType: 'Notification', entityTable: 'notifications' }
    );

    setImmediate(() => {
      this.NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'NOTIFICATION_RETRY_REQUESTED',
        userId: adminUserId,
        relatedEntity: notificationId,
        metadata: { notificationId, canal: effectiveChannel, logoUrl: notifications.ses.logoUrl }
      }).catch(err => logger.warn('Error enviando NOTIFICATION_RETRY_REQUESTED', { error: err.message }));
    });

    const notificationType =
      notification.notification_type ||
      (await this.notificationTypeRepo.findById(notification.notification_type_id, {
        include: [{ association: 'category' }]
      }));

    // Los canales soportados los define la categoría del tipo (fuente de verdad).
    const category = notificationType?.category || null;

    // Reenvío inmediato ignorando quiet hours (override de admin)
    setImmediate(async () => {
      try {
        if ((effectiveChannel === 'email' || effectiveChannel === 'all') && (category?.supports_email ?? true)) {
          await this.notificationSendingService.enviarEmailIndividual(
            notification.user_id,
            notificationType,
            notification.metadata || {},
            notificationId
          );
        }
        if ((effectiveChannel === 'push' || effectiveChannel === 'all') && (category?.supports_push ?? true)) {
          await this.notificationSendingService.enviarPushIndividual(
            notification.user_id,
            notification.title,
            notification.body,
            notification.metadata || {},
            notificationId
          );
        }
        if ((effectiveChannel === 'sms' || effectiveChannel === 'all') && (category?.supports_sms ?? false)) {
          await this.notificationSendingService.enviarSmsIndividual(
            notification.user_id,
            notification.body,
            notification.metadata || {},
            notificationId
          );
        }
        // El estado real se deriva de los flags de cada canal (puede quedar partial_failure
        // si solo uno de los canales reintentados volvió a fallar).
        const finalStatus = await this.notificationSendingService.actualizarEstadoEntrega(notificationId, notificationType);
        logger.info('[NotificationDelivery] Reintento procesado', { notificationId, effectiveChannel, finalStatus });
      } catch (err) {
        await this.notificationRepo.updateProcessingStatus(notificationId, Notification.PROCESSING_STATUS.FAILED);
        logger.warn('[NotificationDelivery] Error en reintento admin', { notificationId, error: err.message });
      }
    });

    return {
      notificationId,
      channel: effectiveChannel,
      status: 'retry_initiated'
    };
  }
}

/**
 * Determina el canal efectivo a reintentar según lo que realmente falló.
 * Si el admin pide 'all' pero solo email falló, retorna 'email'.
 *
 * Hard bounce: el worker automático (notification-retry.service) cierra el canal con
 * markEmail/PushPermanentFailure, que deja *_error seteado y *_next_retry_at = null. Ese canal NO
 * es reintentable (buzón/endpoint muerto: reenviarlo sólo repite el bounce). Se distingue del fallo
 * temporal agotado —que conserva una fecha en *_next_retry_at y SÍ es reintentable manualmente— por
 * *_next_retry_at === null. resetForRetry y el estado inicial dejan *_error = null, así que
 * (*_error && *_next_retry_at === null) identifica unívocamente el cierre por hard bounce.
 */
function _resolverCanal(notification, requestedChannel) {
  const emailClosed = !!notification.email_error && notification.email_next_retry_at === null;
  const pushClosed = !!notification.push_error && notification.push_next_retry_at === null;
  const smsClosed = !!notification.sms_error && notification.sms_next_retry_at === null;

  const emailFailed = !notification.email_sent && !!notification.email_error && !emailClosed;
  const pushFailed = !notification.push_sent && !!notification.push_error && !pushClosed;
  const smsFailed = !notification.sms_sent && !!notification.sms_error && !smsClosed;

  if (requestedChannel === 'email') {
    return emailFailed ? 'email' : null;
  }
  if (requestedChannel === 'push') {
    return pushFailed ? 'push' : null;
  }
  if (requestedChannel === 'sms') {
    return smsFailed ? 'sms' : null;
  }

  // 'all' — reintentar sólo lo realmente reintentable. Si falló más de un canal se reintenta todo;
  // si falló uno solo se acota a ese canal.
  const failedChannels = [
    emailFailed && 'email',
    pushFailed && 'push',
    smsFailed && 'sms'
  ].filter(Boolean);

  if (failedChannels.length > 1) {
    return 'all';
  }
  if (failedChannels.length === 1) {
    return failedChannels[0];
  }

  // Nada falló explícitamente pero processing_status es failed — reintentar todo, salvo que algún
  // canal esté cerrado por hard bounce (no re-abrir un buzón muerto vía el fallback).
  if (
    notification.processing_status === Notification.PROCESSING_STATUS.FAILED &&
    !emailClosed &&
    !pushClosed &&
    !smsClosed
  ) {
    return 'all';
  }
  return null;
}

module.exports = new AdminNotificationDeliveryService();
module.exports.AdminNotificationDeliveryService = AdminNotificationDeliveryService;
