const MaskingUtil = require('../../../../shared/utils/masking.util');

function NotificationDeliveryListDTO(record) {
  return {
    notificationId: record.notification_id,
    userId: record.user_id,
    title: record.title,
    body: record.body,
    processingStatus: record.processing_status,
    emailSent: record.email_sent,
    emailError: record.email_error || null,
    emailRetryCount: record.email_retry_count,
    pushSent: record.push_sent,
    pushError: record.push_error || null,
    pushRetryCount: record.push_retry_count,
    smsSent: record.sms_sent,
    smsError: record.sms_error || null,
    smsRetryCount: record.sms_retry_count,
    retryCount: record.retry_count,
    notificationType: record.notification_type
      ? {
          code: record.notification_type.code,
          name: record.notification_type.name,
          // Canales y criticidad viven en la categoría del tipo (fuente de verdad).
          category: record.notification_type.category
            ? {
                code: record.notification_type.category.code,
                name: record.notification_type.category.name,
                supportsEmail: record.notification_type.category.supports_email,
                supportsPush: record.notification_type.category.supports_push,
                supportsSms: record.notification_type.category.supports_sms,
                isCritical: record.notification_type.category.is_critical
              }
            : null
        }
      : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function NotificationDeliveryDetailDTO(record) {
  return {
    ...NotificationDeliveryListDTO(record),
    // [RF-USR-01] | CA-06 | El metadata de la notificación lleva el correo real del titular
    // (crearNotificacion lo recibe de los services) → redactor profundo por key.
    metadata: MaskingUtil.redactPayload(record.metadata) || null,
    relatedEntityType: record.related_entity_type || null,
    relatedEntityId: record.related_entity_id || null,
    scheduledFor: record.scheduled_for || null,
    emailSentAt: record.email_sent_at || null,
    emailNextRetryAt: record.email_next_retry_at || null,
    pushSentAt: record.push_sent_at || null,
    pushNextRetryAt: record.push_next_retry_at || null,
    smsSentAt: record.sms_sent_at || null,
    smsNextRetryAt: record.sms_next_retry_at || null
  };
}

const PERCENT_SCALE = 100;
const PERCENT_DECIMALS = 100; // 2 decimales

// Tasa de éxito de un canal: enviados / intentados. null cuando no hubo intentos (no se
// inventa un 0% ni un 100% donde el canal ni siquiera aplicó). Redondeada a 2 decimales.
function _successRate(sent, attempted) {
  if (!attempted) {
    return null;
  }
  return Math.round((sent / attempted) * PERCENT_SCALE * PERCENT_DECIMALS) / PERCENT_DECIMALS;
}

function _channelBlock(row, channel) {
  const attempted = row[`${channel}_attempted`] || 0;
  const sent = row[`${channel}_sent`] || 0;
  const failed = row[`${channel}_failed`] || 0;
  return { attempted, sent, failed, successRate: _successRate(sent, attempted) };
}

function _statusBlock(row) {
  return {
    completed: row.status_completed || 0,
    partialFailure: row.status_partial_failure || 0,
    failed: row.status_failed || 0,
    pending: row.status_pending || 0,
    processing: row.status_processing || 0
  };
}

function _channelsBlock(row) {
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
function NotificationDeliveryMetricsDTO(rows, range) {
  const overallRow = rows.reduce((acc, r) => {
    for (const key of Object.keys(r)) {
      if (typeof r[key] === 'number') {
        acc[key] = (acc[key] || 0) + r[key];
      }
    }
    return acc;
  }, {});

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

module.exports = { NotificationDeliveryListDTO, NotificationDeliveryDetailDTO, NotificationDeliveryMetricsDTO };
