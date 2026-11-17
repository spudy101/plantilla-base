import type defineNotification = require('../../../schemas/notification/models/notification.model');
// NOTA DE UBICACIÓN (cross-dominio): este panel vive en modules/admin/notification/ pero NO tiene
// modelo/tabla propia: es una vista de auditoría/observabilidad de ENTREGAS de notificaciones
// (delivery status, fallos, reintentos, métricas) respaldada por la tabla `notifications` del
// dominio schemas/notification. Su carácter es de oversight, no de negocio.
import notificationRepo = require('../../../schemas/notification/repositories/notification.repository');
import notificationTypeRepo = require('../../../schemas/notification/repositories/notification-type.repository');
import notificationSendingService = require('../../../schemas/notification/services/notification-sending.service');
import NotificationCreationService = require('../../../schemas/notification/services/notification-creation.service');
import PaginationHelper = require('../../../../shared/utils/pagination.util');
import componentsCatalogDtoModule = require('../../../../shared/dtos/kyc/components-catalog.dto');
const { MetadataDTO } = componentsCatalogDtoModule;
import AppError = require('../../../../shared/utils/app-error.util');
import loggerUtilModule = require('../../../../shared/utils/logger.util');
const { logger, logAudit } = loggerUtilModule;
import constantsModule = require('../../../../shared/constants');
const { notifications } = constantsModule;
import domainEnumsModule = require('../../../../shared/constants/domain-enums');
const { NOTIFICATION_PROCESSING_STATUS } = domainEnumsModule;
import adminNotificationDeliveryDtoModule = require('../dtos/admin-notification-delivery.dto');
import errorMessageModule = require('../../../../shared/utils/error-message.util');

const { errorMessage } = errorMessageModule;

const {
  NotificationDeliveryListDTO,
  NotificationDeliveryDetailDTO,
  NotificationDeliveryMetricsDTO
} = adminNotificationDeliveryDtoModule;

class AdminNotificationDeliveryService {
  notificationRepo: typeof notificationRepo;
  notificationTypeRepo: typeof notificationTypeRepo;
  notificationSendingService: typeof notificationSendingService;
  NotificationCreationService: typeof NotificationCreationService;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new AdminNotificationDeliveryService({ notificationRepo: fake })
   * @param {object} [deps]
   */
  constructor(deps: AdminNotificationDeliveryService.Deps = {}) {
    this.notificationRepo = deps.notificationRepo ?? notificationRepo;
    this.notificationTypeRepo = deps.notificationTypeRepo ?? notificationTypeRepo;
    this.notificationSendingService = deps.notificationSendingService ?? notificationSendingService;
    this.NotificationCreationService = deps.NotificationCreationService ?? NotificationCreationService;
  }

  async list(query: Record<string, unknown>, adminUserId: string) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const filters = {
      processingStatus: PaginationHelper.stringParam(query, 'processingStatus') as defineNotification.Attributes['processing_status'] | null,
      channel: _channelParam(PaginationHelper.stringParam(query, 'channel')),
      userId: PaginationHelper.stringParam(query, 'userId'),
      from: PaginationHelper.stringParam(query, 'from'),
      to: PaginationHelper.stringParam(query, 'to'),
      // El validator lo deja como boolean (.toBoolean()); false/ausente → sin filtro
      onlyCritical: PaginationHelper.booleanParam(query, 'onlyCritical') === true ? true : null
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

  async metrics(query: Record<string, unknown>, adminUserId: string) {
    const range = { from: PaginationHelper.stringParam(query, 'from'), to: PaginationHelper.stringParam(query, 'to') };
    const rows = await this.notificationRepo.deliveryMetrics({
      from: range.from,
      to: range.to,
      userId: PaginationHelper.stringParam(query, 'userId')
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

  async getById(notificationId: string, adminUserId: string) {
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

  async retry(notificationId: string, channel: 'email' | 'push' | 'sms' | 'all' = 'all', adminUserId: string) {
    const notification = await this.notificationRepo.findByIdWithType(notificationId);
    if (!notification) {
      throw AppError.notFound('Notificación no encontrada');
    }

    if (notification.processing_status === NOTIFICATION_PROCESSING_STATUS.COMPLETED) {
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
        relatedEntity: { type: 'Notification', id: notificationId },
        metadata: { notificationId, canal: effectiveChannel, logoUrl: notifications.ses.logoUrl }
      }).catch(err => logger.warn('Error enviando NOTIFICATION_RETRY_REQUESTED', { error: err.message }));
    });

    const notificationType =
      notification.notification_type ||
      (await this.notificationTypeRepo.findById(notification.notification_type_id, {
        include: [{ association: 'category' }]
      }));
    if (!notificationType) {
      throw AppError.notFound('Tipo de notificación no encontrado');
    }
    const metadata = (notification.metadata ?? {}) as Record<string, unknown>;

    // Los canales soportados los define la categoría del tipo (fuente de verdad).
    const category = notificationType?.category || null;

    // Reenvío inmediato ignorando quiet hours (override de admin)
    setImmediate(async () => {
      try {
        if ((effectiveChannel === 'email' || effectiveChannel === 'all') && (category?.supports_email ?? true)) {
          await this.notificationSendingService.enviarEmailIndividual(
            notification.user_id,
            notificationType,
            metadata,
            notificationId
          );
        }
        if ((effectiveChannel === 'push' || effectiveChannel === 'all') && (category?.supports_push ?? true)) {
          await this.notificationSendingService.enviarPushIndividual(
            notification.user_id,
            notification.title,
            notification.body,
            metadata,
            notificationId
          );
        }
        if ((effectiveChannel === 'sms' || effectiveChannel === 'all') && (category?.supports_sms ?? false)) {
          await this.notificationSendingService.enviarSmsIndividual(
            notification.user_id,
            notification.body,
            metadata,
            notificationId
          );
        }
        // El estado real se deriva de los flags de cada canal (puede quedar partial_failure
        // si solo uno de los canales reintentados volvió a fallar).
        const finalStatus = await this.notificationSendingService.actualizarEstadoEntrega(notificationId, notificationType);
        logger.info('[NotificationDelivery] Reintento procesado', { notificationId, effectiveChannel, finalStatus });
      } catch (err) {
        await this.notificationRepo.updateProcessingStatus(notificationId, NOTIFICATION_PROCESSING_STATUS.FAILED);
        logger.warn('[NotificationDelivery] Error en reintento admin', { notificationId, error: errorMessage(err) });
      }
    });

    return {
      notificationId,
      channel: effectiveChannel,
      status: 'retry_initiated'
    };
  }
}

const CHANNELS = ['email', 'push', 'sms'] as const;

/** Canal del query string: solo uno de los conocidos, si no null (sin filtro). */
function _channelParam(value: string | null): (typeof CHANNELS)[number] | null {
  return (CHANNELS as readonly string[]).includes(value ?? '') ? (value as (typeof CHANNELS)[number]) : null;
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
function _resolverCanal(notification: defineNotification.Instance, requestedChannel: 'email' | 'push' | 'sms' | 'all'): 'email' | 'push' | 'sms' | 'all' | null {
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
  ].filter((c): c is 'email' | 'push' | 'sms' => Boolean(c));

  if (failedChannels.length > 1) {
    return 'all';
  }
  if (failedChannels.length === 1) {
    return failedChannels[0] ?? null;
  }

  // Nada falló explícitamente pero processing_status es failed — reintentar todo, salvo que algún
  // canal esté cerrado por hard bounce (no re-abrir un buzón muerto vía el fallback).
  if (
    notification.processing_status === NOTIFICATION_PROCESSING_STATUS.FAILED &&
    !emailClosed &&
    !pushClosed &&
    !smsClosed
  ) {
    return 'all';
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace AdminNotificationDeliveryService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    notificationRepo?: typeof notificationRepo;
    notificationTypeRepo?: typeof notificationTypeRepo;
    notificationSendingService?: typeof notificationSendingService;
    NotificationCreationService?: typeof NotificationCreationService;
  }
}

export = Object.assign(new AdminNotificationDeliveryService(), { AdminNotificationDeliveryService });
