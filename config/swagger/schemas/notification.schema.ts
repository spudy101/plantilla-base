/**
 * ============================================================
 * NOTIFICATION SCHEMA — Global
 * ============================================================
 * Derivado de components-notification.dto.js
 *
 * Mapa DTO → Schema:
 *   NotificationTypeComponent             → NotificationType
 *   NotificationComponent                 → Notification
 *   GlobalNotificationComponent           → GlobalNotification
 *   GlobalNotificationReadComponent       → GlobalNotificationRead
 *   UserPushTokenComponent                → UserPushToken
 *   UserNotificationPreferenceComponent   → UserNotificationPreference
 */

import piiMaskingDocModule = require('./pii-masking.doc');
const { REDACTED_PAYLOAD_DESC } = piiMaskingDocModule;

// ─── NotificationCategoryComponent.build() ────────────────────
// Categoría (grupo) de notificaciones: FUENTE DE VERDAD de los canales (push/email/sms), del
// "no molestar" (DND) y del layout base del email. Cada NotificationType pertenece a una categoría.
const NotificationCategory = {
  type: 'object',
  properties: {
    notificationCategoryId: { type: 'string', format: 'uuid' },
    code: { type: 'string', example: 'SECURITY' },
    name: { type: 'string', example: 'Seguridad' },
    description: { type: 'string', nullable: true },
    supportsPush: { type: 'boolean' },
    supportsEmail: { type: 'boolean' },
    supportsSms: { type: 'boolean' },
    allowDnd: {
      type: 'boolean',
      description: 'Si es `false`, el usuario NO puede silenciar esta categoría (se ignora su quiet hours).'
    },
    isCritical: {
      type: 'boolean',
      description: 'Si es `true`, es emergencia: ignora quiet hours y no es silenciable por el usuario.'
    },
    defaultQuietHoursStart: { type: 'string', nullable: true, example: '22:00' },
    defaultQuietHoursEnd: { type: 'string', nullable: true, example: '08:00' },
    priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], example: 'normal' },
    sortOrder: { type: 'integer', example: 1 },
    isActive: { type: 'boolean' }
  }
};

// ─── NotificationTypeComponent.build() ────────────────────────
const NotificationType = {
  type: 'object',
  properties: {
    notificationTypeId: { type: 'string', format: 'uuid' },
    code: { type: 'string', example: 'OPERATION_APPROVED' },
    name: { type: 'string', example: 'Operación aprobada' },
    description: { type: 'string', nullable: true },
    notificationCategoryId: {
      type: 'string',
      format: 'uuid',
      nullable: true,
      description: 'Categoría a la que pertenece el tipo. Los canales, DND y layout de email salen de la categoría.'
    },
    priority: {
      type: 'string',
      enum: ['low', 'normal', 'high', 'urgent'],
      example: 'normal',
      description: 'Nivel de urgencia del tipo de notificación: low, normal, high o urgent'
    },
    isActive: { type: 'boolean' },
    // Se incluye cuando la asociación viene cargada (canales/DND/criticidad efectivos).
    category: { allOf: [{ $ref: '#/components/schemas/NotificationCategory' }], nullable: true }
  }
};

// ─── NotificationTypeComponent.build(nt, includeTemplates=true) — solo admin ──
const NotificationTypeWithTemplates = {
  allOf: [
    { $ref: '#/components/schemas/NotificationType' },
    {
      type: 'object',
      properties: {
        titleTemplate: { type: 'string' },
        bodyTemplate: { type: 'string' },
        emailSubjectTemplate: { type: 'string', nullable: true },
        emailBodyTemplate: { type: 'string', nullable: true }
      }
    }
  ]
};

// ─── NotificationComponent.build() ────────────────────────────
const Notification = {
  type: 'object',
  properties: {
    notificationId: { type: 'string', format: 'uuid' },
    userId: { type: 'string', format: 'uuid' },
    notificationTypeId: { type: 'string', format: 'uuid', nullable: true },
    title: { type: 'string', example: 'Tu solicitud fue aprobada' },
    body: { type: 'string', example: 'Revisa los detalles en la app.' },
    relatedEntityType: { type: 'string', nullable: true, example: 'operation' },
    relatedEntityId: { type: 'string', format: 'uuid', nullable: true },
    metadata: { type: 'object', nullable: true, description: REDACTED_PAYLOAD_DESC },
    isRead: { type: 'boolean' },
    readAt: { type: 'string', format: 'date-time', nullable: true },
    processingStatus: {
      type: 'string',
      enum: ['pending', 'processing', 'completed', 'failed'],
      example: 'completed'
    },
    scheduledFor: { type: 'string', format: 'date-time', nullable: true },
    priority: { type: 'integer', minimum: 1, maximum: 10, example: 5 },
    createdAt: { type: 'string', format: 'date-time' },
    // includeType = true
    notificationType: { $ref: '#/components/schemas/NotificationType', nullable: true }
  }
};

// ─── Notification con delivery — solo admin (includeDelivery = true) ──────────
const NotificationDeliveryBlock = {
  type: 'object',
  properties: {
    delivery: {
      type: 'object',
      properties: {
        push: {
          type: 'object',
          properties: {
            sent: { type: 'boolean' },
            sentAt: { type: 'string', format: 'date-time', nullable: true },
            error: { type: 'string', nullable: true },
            retryCount: { type: 'integer' },
            nextRetryAt: { type: 'string', format: 'date-time', nullable: true }
          }
        },
        email: {
          type: 'object',
          properties: {
            sent: { type: 'boolean' },
            sentAt: { type: 'string', format: 'date-time', nullable: true },
            error: { type: 'string', nullable: true },
            retryCount: { type: 'integer' },
            nextRetryAt: { type: 'string', format: 'date-time', nullable: true }
          }
        }
      }
    }
  }
};

const NotificationWithDelivery = {
  description: 'Notification con bloque delivery — exclusivo del panel admin (includeDelivery=true).',
  allOf: [{ $ref: '#/components/schemas/Notification' }, NotificationDeliveryBlock]
};

// ─── GlobalNotificationComponent.build() ──────────────────────
const GlobalNotification = {
  type: 'object',
  properties: {
    globalNotificationId: { type: 'string', format: 'uuid' },
    notificationTypeId: { type: 'string', format: 'uuid', nullable: true },
    title: { type: 'string' },
    body: { type: 'string' },
    metadata: { type: 'object', nullable: true, description: REDACTED_PAYLOAD_DESC },
    sendPush: { type: 'boolean' },
    sendEmail: { type: 'boolean' },
    sendInApp: { type: 'boolean' },
    isActive: { type: 'boolean' },
    startsAt: { type: 'string', format: 'date-time' },
    endsAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    // presente en todos los endpoints client (isRead !== null)
    isRead: { type: 'boolean' },
    // includeType = true
    notificationType: { $ref: '#/components/schemas/NotificationType', nullable: true }
  }
};

// ─── GlobalNotification con stats + targeting — solo admin ────────────────────
const GlobalNotificationAdminBlock = {
  type: 'object',
  properties: {
    stats: {
      type: 'object',
      description: 'Solo presente con includeStats=true (admin).',
      properties: {
        totalTargetUsers: { type: 'integer' },
        pushSentCount: { type: 'integer' },
        emailSentCount: { type: 'integer' },
        pushProcessingStatus: {
          type: 'string',
          enum: ['pending', 'processing', 'completed', 'failed']
        },
        emailProcessingStatus: {
          type: 'string',
          enum: ['pending', 'processing', 'completed', 'failed']
        },
        processingStartedAt: { type: 'string', format: 'date-time', nullable: true },
        processingCompletedAt: { type: 'string', format: 'date-time', nullable: true },
        batchSize: { type: 'integer' }
      }
    },
    targeting: {
      type: 'object',
      description: 'Solo presente con includeTargeting=true (admin).',
      properties: {
        targetUserRole: { type: 'string', nullable: true },
        targetConditions: { type: 'object', nullable: true },
        createdByUserId: { type: 'string', format: 'uuid', nullable: true }
      }
    }
  }
};

const GlobalNotificationAdmin = {
  description: 'GlobalNotification con stats y targeting — exclusivo del panel admin.',
  allOf: [{ $ref: '#/components/schemas/GlobalNotification' }, GlobalNotificationAdminBlock]
};

// ─── GlobalNotificationReadComponent.build() ──────────────────
const GlobalNotificationRead = {
  type: 'object',
  properties: {
    globalNotificationId: { type: 'string', format: 'uuid' },
    userId: { type: 'string', format: 'uuid' },
    readAt: { type: 'string', format: 'date-time' }
  }
};

// ─── UserPushTokenComponent.build() ───────────────────────────
const UserPushToken = {
  type: 'object',
  properties: {
    userPushTokenId: { type: 'string', format: 'uuid' },
    userId: { type: 'string', format: 'uuid' },
    token: { type: 'string' },
    platform: { type: 'string', enum: ['ios', 'android', 'web'], example: 'ios' },
    deviceId: { type: 'string', nullable: true },
    isActive: { type: 'boolean' },
    lastUsedAt: { type: 'string', format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' }
  }
};

// ─── UserNotificationPreferenceComponent.build() ──────────────
const UserNotificationPreference = {
  type: 'object',
  properties: {
    userNotificationPreferenceId: { type: 'string', format: 'uuid' },
    userId: { type: 'string', format: 'uuid' },
    notificationCategoryCode: {
      type: 'string',
      nullable: true,
      example: 'SECURITY',
      description: 'Categoría a la que aplica la preferencia. `null` = preferencia global (todas las categorías).'
    },
    allowPush: { type: 'boolean' },
    allowEmail: { type: 'boolean' },
    allowSms: { type: 'boolean' },
    quietHoursStart: { type: 'string', nullable: true, example: '22:00' },
    quietHoursEnd: { type: 'string', nullable: true, example: '08:00' },
    category: { allOf: [{ $ref: '#/components/schemas/NotificationCategory' }], nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

// ─── Exports ──────────────────────────────────────────────────

export = {
  NotificationCategory,
  NotificationType,
  NotificationTypeWithTemplates,
  Notification,
  NotificationWithDelivery,
  GlobalNotification,
  GlobalNotificationAdmin,
  GlobalNotificationRead,
  UserPushToken,
  UserNotificationPreference
};
