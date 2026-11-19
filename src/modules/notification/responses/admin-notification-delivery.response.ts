import { z } from '../../../shared/validation/z';
import { dateTime } from '../../../shared/validation/output';
import { PROCESSING_STATUSES } from './notification-components.response';
import type { Notification } from '../../../shared/database/generated/prisma/client';
import type notificationRepository from '../repositories/notification.repository';
type NotificationRepositoryPort = typeof notificationRepository;
import MaskingUtil from '../../../shared/security/masking.util';

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

// ── Esquemas de salida ──
const channelState = (channel: 'email' | 'push' | 'sms') => ({
  [`${channel}Sent`]: z.boolean(),
  [`${channel}Error`]: z.string().nullable(),
  [`${channel}RetryCount`]: z.number().int()
});

export const NotificationDeliveryItemSchema = z.object({
  notificationId: z.uuid(),
  userId: z.uuid(),
  title: z.string(),
  body: z.string(),
  processingStatus: z.enum(PROCESSING_STATUSES).nullable(),
  ...channelState('email'),
  ...channelState('push'),
  ...channelState('sms'),
  retryCount: z.number().int(),
  notificationType: z
    .object({
      code: z.string().meta({ example: 'OPERATION_APPROVED' }),
      name: z.string(),
      category: z
        .object({
          code: z.string(),
          name: z.string(),
          supportsEmail: z.boolean(),
          supportsPush: z.boolean(),
          supportsSms: z.boolean(),
          isCritical: z.boolean()
        })
        .nullable()
    })
    .nullable(),
  createdAt: dateTime(),
  updatedAt: dateTime()
});

const channelTimes = (channel: 'email' | 'push' | 'sms') => ({
  [`${channel}SentAt`]: dateTime().nullable(),
  [`${channel}NextRetryAt`]: dateTime().nullable()
});

export const NotificationDeliveryDetailSchema = NotificationDeliveryItemSchema.extend({
  metadata: z
    .record(z.string(), z.unknown())
    .nullable()
    .meta({ description: 'Variables del mensaje. Los datos personales salen enmascarados.' }),
  relatedEntityType: z.string().nullable(),
  relatedEntityId: z.string().nullable(),
  scheduledFor: dateTime().nullable(),
  ...channelTimes('email'),
  ...channelTimes('push'),
  ...channelTimes('sms')
});

const ChannelMetricSchema = z.object({
  attempted: z.number().int(),
  sent: z.number().int(),
  failed: z.number().int(),
  successRate: z
    .number()
    .nullable()
    .meta({ example: 98.5, description: 'Porcentaje enviado/intentado. null si no hubo intentos.' })
});
const StatusCountsSchema = z.object({
  completed: z.number().int(),
  partialFailure: z.number().int(),
  failed: z.number().int(),
  pending: z.number().int(),
  processing: z.number().int()
});
const ChannelsSchema = z.object({ email: ChannelMetricSchema, push: ChannelMetricSchema, sms: ChannelMetricSchema });

export const NotificationDeliveryMetricsSchema = z.object({
  range: z.object({
    from: z.unknown().meta({ description: 'Inicio del rango (ISO 8601) o null.' }),
    to: z.unknown().meta({ description: 'Fin del rango (ISO 8601) o null.' })
  }),
  total: z.number().int(),
  byStatus: StatusCountsSchema,
  byChannel: ChannelsSchema,
  byCategory: z.array(
    z.object({
      categoryCode: z.string().nullable(),
      categoryName: z.string().meta({ example: 'Sin categoría' }),
      total: z.number().int(),
      byStatus: StatusCountsSchema,
      byChannel: ChannelsSchema
    })
  )
});

export const NotificationDeliveryRetrySchema = z.object({
  notificationId: z.uuid(),
  channel: z.enum(['email', 'push', 'sms', 'all']).meta({ description: 'Canal que se reintenta (puede diferir del pedido).' }),
  status: z.literal('retry_initiated')
});
