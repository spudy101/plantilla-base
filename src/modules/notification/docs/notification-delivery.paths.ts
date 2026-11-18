import commonResponses from '../../../config/swagger/responses/common.responses';
import piiMaskingDocModule from '../../../config/swagger/schemas/pii-masking.doc';
const { REDACTED_PAYLOAD_DESC } = piiMaskingDocModule;

/**
 * ============================================================
 * NOTIFICATION DELIVERY PATHS — ADMIN  (RF-ADM-03)
 * ============================================================
 * Módulo: /admin/api/v1/notification/notification-delivery
 * Roles:
 *   GET → RBAC AUDIT + READ (SUPERADMIN, AUDITOR_INTERNO)
 *   POST retry → RBAC AUDIT + UPDATE (SUPERADMIN, ADMIN_PRODUCTOS)
 *
 * Rutas:
 *   GET  /admin/api/v1/notification/notification-delivery
 *   GET  /admin/api/v1/notification/notification-delivery/:id
 *   POST /admin/api/v1/notification/notification-delivery/:id/retry?channel=email|push|sms|all
 */

const schemas = {
  NotificationDeliveryType: {
    type: 'object',
    nullable: true,
    description: 'Tipo de notificación asociado. Los canales y la criticidad viven en su categoría.',
    properties: {
      code: { type: 'string', example: 'AUTH_SESSION_REVOKED_CLIENT' },
      name: { type: 'string', example: 'Sesión revocada por administrador' },
      category: {
        type: 'object',
        nullable: true,
        description: 'Categoría del tipo — fuente de verdad de canales y criticidad.',
        properties: {
          code: { type: 'string', example: 'SECURITY' },
          name: { type: 'string', example: 'Seguridad' },
          supportsEmail: { type: 'boolean' },
          supportsPush: { type: 'boolean' },
          supportsSms: { type: 'boolean' },
          isCritical: {
            type: 'boolean',
            description: 'true = la entrega de esta categoría al usuario es crítica (filtrable con onlyCritical).'
          }
        }
      }
    }
  },

  NotificationDeliveryItem: {
    type: 'object',
    description: 'Entrega de notificación — vista de listado.',
    properties: {
      notificationId: { type: 'string', format: 'uuid' },
      userId: { type: 'string', format: 'uuid', description: 'UUID del usuario destinatario.' },
      title: { type: 'string', nullable: true, example: 'Tu sesión ha sido revocada' },
      body: { type: 'string', nullable: true, example: 'Un administrador ha cerrado tu sesión activa.' },
      processingStatus: {
        type: 'string',
        enum: ['pending', 'processing', 'completed', 'failed', 'partial_failure'],
        description: 'Estado de procesamiento de la notificación.'
      },
      emailSent: { type: 'boolean' },
      emailError: { type: 'string', nullable: true, description: 'Mensaje del último error al enviar email.' },
      emailRetryCount: { type: 'integer', example: 0 },
      pushSent: { type: 'boolean' },
      pushError: { type: 'string', nullable: true, description: 'Mensaje del último error al enviar push.' },
      pushRetryCount: { type: 'integer', example: 0 },
      smsSent: { type: 'boolean' },
      smsError: { type: 'string', nullable: true, description: 'Mensaje del último error al enviar SMS.' },
      smsRetryCount: { type: 'integer', example: 0 },
      retryCount: { type: 'integer', example: 0, description: 'Total de reintentos globales.' },
      notificationType: { $ref: '#/components/schemas/NotificationDeliveryType' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' }
    }
  },

  NotificationDeliveryDetail: {
    allOf: [
      { $ref: '#/components/schemas/NotificationDeliveryItem' },
      {
        type: 'object',
        description: 'Entrega de notificación — vista de detalle.',
        properties: {
          metadata: {
            type: 'object',
            nullable: true,
            description: `Variables de plantilla usadas al generar la notificación. ${REDACTED_PAYLOAD_DESC}`,
            additionalProperties: true
          },
          relatedEntityType: {
            type: 'string',
            nullable: true,
            example: 'AuthSession',
            description: 'Tipo de entidad relacionada con la notificación.'
          },
          relatedEntityId: {
            type: 'string',
            nullable: true,
            format: 'uuid',
            description: 'UUID de la entidad relacionada.'
          },
          scheduledFor: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Fecha programada de envío (quiet hours diferidas).'
          },
          emailSentAt: { type: 'string', format: 'date-time', nullable: true },
          emailNextRetryAt: { type: 'string', format: 'date-time', nullable: true },
          pushSentAt: { type: 'string', format: 'date-time', nullable: true },
          pushNextRetryAt: { type: 'string', format: 'date-time', nullable: true },
          smsSentAt: { type: 'string', format: 'date-time', nullable: true },
          smsNextRetryAt: { type: 'string', format: 'date-time', nullable: true }
        }
      }
    ]
  },

  NotificationDeliveryRetryResult: {
    type: 'object',
    description: 'Resultado inmediato de la solicitud de reintento.',
    properties: {
      notificationId: { type: 'string', format: 'uuid' },
      channel: {
        type: 'string',
        enum: ['email', 'push', 'sms', 'all'],
        description: 'Canal efectivo que se reintentará (puede diferir del canal solicitado).'
      },
      status: { type: 'string', example: 'retry_initiated' }
    }
  },

  NotificationDeliveryChannelMetric: {
    type: 'object',
    description: 'Métricas de un canal. successRate = sent / attempted (null si no hubo intentos).',
    properties: {
      attempted: { type: 'integer', example: 120, description: 'Enviadas OK o con error registrado (denominador).' },
      sent: { type: 'integer', example: 114, description: 'Enviadas con éxito.' },
      failed: { type: 'integer', example: 6, description: 'No enviadas y con error.' },
      successRate: {
        type: 'number',
        nullable: true,
        example: 95.0,
        description: 'Porcentaje de éxito (0-100, 2 decimales). null si attempted = 0.'
      }
    }
  },

  NotificationDeliveryStatusCounts: {
    type: 'object',
    description: 'Conteo de notificaciones por processing_status.',
    properties: {
      completed: { type: 'integer', example: 100 },
      partialFailure: { type: 'integer', example: 8 },
      failed: { type: 'integer', example: 5 },
      pending: { type: 'integer', example: 3 },
      processing: { type: 'integer', example: 0 }
    }
  },

  NotificationDeliveryChannels: {
    type: 'object',
    properties: {
      email: { $ref: '#/components/schemas/NotificationDeliveryChannelMetric' },
      push: { $ref: '#/components/schemas/NotificationDeliveryChannelMetric' },
      sms: { $ref: '#/components/schemas/NotificationDeliveryChannelMetric' }
    }
  },

  NotificationDeliveryMetrics: {
    type: 'object',
    description: 'Métricas agregadas de entrega: overall + desglose por categoría.',
    properties: {
      range: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date-time', nullable: true },
          to: { type: 'string', format: 'date-time', nullable: true }
        }
      },
      total: { type: 'integer', example: 116, description: 'Total de notificaciones en el rango.' },
      byStatus: { $ref: '#/components/schemas/NotificationDeliveryStatusCounts' },
      byChannel: { $ref: '#/components/schemas/NotificationDeliveryChannels' },
      byCategory: {
        type: 'array',
        description: 'Mismas métricas desglosadas por categoría de notificación.',
        items: {
          type: 'object',
          properties: {
            categoryCode: { type: 'string', nullable: true, example: 'SECURITY' },
            categoryName: { type: 'string', example: 'Seguridad' },
            total: { type: 'integer', example: 40 },
            byStatus: { $ref: '#/components/schemas/NotificationDeliveryStatusCounts' },
            byChannel: { $ref: '#/components/schemas/NotificationDeliveryChannels' }
          }
        }
      }
    }
  }
};

const notificationIdParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'UUID de la notificación.',
  schema: { type: 'string', format: 'uuid' }
};

const paths = {
  '/admin/api/v1/notification/notification-delivery': {
    get: {
      tags: ['Admin — Auditoría / Entregas de Notificación'],
      summary: 'Listar entregas de notificaciones',
      description:
        'Lista paginada del historial de entregas de notificaciones push y email. ' +
        'Permite filtrar por estado de procesamiento, canal, usuario destinatario y rango de fechas.\n\n' +
        '**Acceso:** SUPERADMIN, AUDITOR_INTERNO.',
      operationId: 'adminListNotificationDelivery',
      security: [{ bearerAuth: [] }, { idTokenAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1, minimum: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        { name: 'sortBy', in: 'query', schema: { type: 'string' } },
        {
          name: 'order',
          in: 'query',
          schema: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC' }
        },
        {
          name: 'processingStatus',
          in: 'query',
          schema: {
            type: 'string',
            enum: ['pending', 'processing', 'completed', 'failed', 'partial_failure']
          },
          description: 'Filtrar por estado de procesamiento.'
        },
        {
          name: 'channel',
          in: 'query',
          schema: { type: 'string', enum: ['email', 'push', 'sms', 'all'] },
          description: 'Filtrar por canal de envío.'
        },
        {
          name: 'userId',
          in: 'query',
          schema: { type: 'string', format: 'uuid' },
          description: 'Filtrar por usuario destinatario.'
        },
        {
          name: 'from',
          in: 'query',
          schema: { type: 'string', format: 'date-time' },
          description: 'Filtrar desde esta fecha (ISO 8601).'
        },
        {
          name: 'to',
          in: 'query',
          schema: { type: 'string', format: 'date-time' },
          description: 'Filtrar hasta esta fecha (ISO 8601).'
        },
        {
          name: 'onlyCritical',
          in: 'query',
          schema: { type: 'boolean' },
          description: 'Si es true, lista solo notificaciones de tipos marcados como críticos (isCritical=true).'
        }
      ],
      responses: {
        200: commonResponses.paginated(
          { $ref: '#/components/schemas/NotificationDeliveryItem' },
          'Entregas de notificaciones obtenidas exitosamente.'
        ),
        ...commonResponses.ValidationError,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/notification/notification-delivery/{id}': {
    get: {
      tags: ['Admin — Auditoría / Entregas de Notificación'],
      summary: 'Detalle de una entrega de notificación',
      description:
        'Retorna el detalle completo de una entrega: timestamps de envío, próximos reintentos, ' +
        'metadatos de plantilla, entidad relacionada y horario diferido por quiet hours.\n\n' +
        '**Acceso:** SUPERADMIN, AUDITOR_INTERNO.',
      operationId: 'adminGetNotificationDeliveryById',
      security: [{ bearerAuth: [] }, { idTokenAuth: [] }],
      parameters: [notificationIdParam],
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/NotificationDeliveryDetail' },
          'Notificación obtenida exitosamente.'
        ),
        ...commonResponses.ValidationError,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/notification/notification-delivery/{id}/retry': {
    post: {
      tags: ['Admin — Auditoría / Entregas de Notificación'],
      summary: 'Reintentar entrega de notificación fallida',
      description: `Solicita el reintento inmediato de una notificación con error de entrega.

El sistema detecta automáticamente qué canal tiene errores pendientes:
- \`channel=email\` → solo reintenta email. Retorna 400 si el email no tiene error.
- \`channel=push\` → solo reintenta push. Retorna 400 si el push no tiene error.
- \`channel=all\` (por defecto) → reintenta solo los canales que efectivamente fallaron.

Si la notificación ya fue entregada exitosamente en todos los canales, retorna 400.

El reintento se ejecuta de forma asíncrona. El campo \`status: "retry_initiated"\` confirma que el proceso fue disparado correctamente.

**Acceso:** SUPERADMIN, ADMIN_PRODUCTOS.`,
      operationId: 'adminRetryNotificationDelivery',
      security: [{ bearerAuth: [] }, { idTokenAuth: [] }],
      parameters: [
        notificationIdParam,
        {
          name: 'channel',
          in: 'query',
          schema: { type: 'string', enum: ['email', 'push', 'sms', 'all'], default: 'all' },
          description: 'Canal a reintentar. Si se omite, reintenta todo lo que falló.'
        }
      ],
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/NotificationDeliveryRetryResult' },
          'Reintento de entrega iniciado exitosamente.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.ValidationError,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.InternalServerError
      }
    }
  }
};

export default { paths, schemas };
