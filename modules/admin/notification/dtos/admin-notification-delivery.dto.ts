import type { Notification } from '../../../../shared/database/generated/prisma/client';
import type { NotificationRepositoryPort } from '../../../schemas/repository-ports';
import MaskingUtil from '../../../../shared/utils/masking.util';

/** Notificación con su tipo y categoría (listado/detalle de entregas del admin). */
type DeliveryRecord = Notification & {
  notificationType: {
    code: string;
    name: string;
    category: {
      code: string;
      name: string;
      supportsEmail: boolean;
      supportsPush: boolean;
      supportsSms: boolean;
      isCritical: boolean;
    } | null;
  } | null;
};
/** Fila agregada por categoría (NotificationRepository.deliveryMetrics). */
type MetricsRow = Awaited<ReturnType<NotificationRepositoryPort['deliveryMetrics']>>[number];

function NotificationDeliveryListDTO(record: DeliveryRecord) {
  return {
    notificationId: record.notificationId,
    userId: record.userId,
    title: record.title,
    body: record.body,
    processingStatus: record.processingStatus,
    emailSent: record.emailSent,
    emailError: record.emailError || null,
    emailRetryCount: record.emailRetryCount,
    pushSent: record.pushSent,
    pushError: record.pushError || null,
    pushRetryCount: record.pushRetryCount,
    smsSent: record.smsSent,
    smsError: record.smsError || null,
    smsRetryCount: record.smsRetryCount,
    retryCount: record.retryCount,
    notificationType: record.notificationType
      ? {
          code: record.notificationType.code,
          name: record.notificationType.name,
          // Canales y criticidad viven en la categoría del tipo (fuente de verdad).
          category: record.notificationType.category
            ? {
                code: record.notificationType.category.code,
                name: record.notificationType.category.name,
                supportsEmail: record.notificationType.category.supportsEmail,
                supportsPush: record.notificationType.category.supportsPush,
                supportsSms: record.notificationType.category.supportsSms,
                isCritical: record.notificationType.category.isCritical
              }
            : null
        }
      : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function NotificationDeliveryDetailDTO(record: DeliveryRecord) {
  return {
    ...NotificationDeliveryListDTO(record),
    // [RF-USR-01] | CA-06 | El metadata de la notificación lleva el correo real del titular
    // (crearNotificacion lo recibe de los services) → redactor profundo por key.
    metadata: MaskingUtil.redactPayload(record.metadata) || null,
    relatedEntityType: record.relatedEntityType || null,
    relatedEntityId: record.relatedEntityId || null,
    scheduledFor: record.scheduledFor || null,
    emailSentAt: record.emailSentAt || null,
    emailNextRetryAt: record.emailNextRetryAt || null,
    pushSentAt: record.pushSentAt || null,
    pushNextRetryAt: record.pushNextRetryAt || null,
    smsSentAt: record.smsSentAt || null,
    smsNextRetryAt: record.smsNextRetryAt || null
  };
}

const PERCENT_SCALE = 100;
const PERCENT_DECIMALS = 100; // 2 decimales

// Tasa de éxito de un canal: enviados / intentados. null cuando no hubo intentos (no se
// inventa un 0% ni un 100% donde el canal ni siquiera aplicó). Redondeada a 2 decimales.
function _successRate(sent: number, attempted: number) {
  if (!attempted) {
    return null;
  }
  return Math.round((sent / attempted) * PERCENT_SCALE * PERCENT_DECIMALS) / PERCENT_DECIMALS;
}

function _channelBlock(row: Partial<MetricsRow>, channel: 'email' | 'push' | 'sms') {
  const attempted = row[`${channel}_attempted`] || 0;
  const sent = row[`${channel}_sent`] || 0;
  const failed = row[`${channel}_failed`] || 0;
  return { attempted, sent, failed, successRate: _successRate(sent, attempted) };
}

function _statusBlock(row: Partial<MetricsRow>) {
  return {
    completed: row.status_completed || 0,
    partialFailure: row.status_partial_failure || 0,
    failed: row.status_failed || 0,
    pending: row.status_pending || 0,
    processing: row.status_processing || 0
  };
}

function _channelsBlock(row: Partial<MetricsRow>) {
  return {
    email: _channelBlock(row, 'email'),
    push: _channelBlock(row, 'push'),
    sms: _channelBlock(row, 'sms')
  };
}

/**
 * Métricas de entrega: recibe las filas agregadas por categoría (repo.deliveryMetrics) y produce
 * el overall (suma de todas las categorías) + el desglose por categoría, cada uno con conteo por
 * processing_status y tasa de éxito por canal (email/push/sms).
 */
function NotificationDeliveryMetricsDTO(rows: MetricsRow[], range: Record<string, unknown>) {
  // Suma columna a columna de los contadores numéricos de todas las categorías
  const overallRow = rows.reduce<Partial<Record<keyof MetricsRow, number>>>((acc, r) => {
    for (const [key, value] of Object.entries(r) as Array<[keyof MetricsRow, unknown]>) {
      if (typeof value === 'number') {
        acc[key] = (acc[key] || 0) + value;
      }
    }
    return acc;
  }, {}) as Partial<MetricsRow>;

  const byCategory = rows.map(r => ({
    categoryCode: r.category_code || null,
    categoryName: r.category_name || 'Sin categoría',
    total: r.total || 0,
    byStatus: _statusBlock(r),
    byChannel: _channelsBlock(r)
  }));

  return {
    range: { from: range.from || null, to: range.to || null },
    total: overallRow.total || 0,
    byStatus: _statusBlock(overallRow),
    byChannel: _channelsBlock(overallRow),
    byCategory
  };
}

export default { NotificationDeliveryListDTO, NotificationDeliveryDetailDTO, NotificationDeliveryMetricsDTO };
