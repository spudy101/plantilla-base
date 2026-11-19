import commonResponses from '../../../config/swagger/responses/common.responses';
import { toOpenApi, toParameters } from '../../../shared/validation/openapi';
import { DeliveryIdParams, DeliveryListQuery, DeliveryMetricsQuery } from '../requests/notification.request';
import {
  NotificationDeliveryDetailSchema,
  NotificationDeliveryItemSchema,
  NotificationDeliveryMetricsSchema,
  NotificationDeliveryRetrySchema
} from '../responses/admin-notification-delivery.response';

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

// Generados desde los esquemas Zod de requests/ y responses/.
const schemas = {
  NotificationDeliveryItem: toOpenApi(NotificationDeliveryItemSchema, 'output'),
  NotificationDeliveryDetail: toOpenApi(NotificationDeliveryDetailSchema, 'output'),
  NotificationDeliveryRetryResult: toOpenApi(NotificationDeliveryRetrySchema, 'output'),
  NotificationDeliveryMetrics: toOpenApi(NotificationDeliveryMetricsSchema, 'output')
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
      parameters: toParameters(DeliveryListQuery, 'query'),
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

  '/admin/api/v1/notification/notification-delivery/metrics': {
    get: {
      tags: ['Admin — Auditoría / Entregas de Notificación'],
      summary: 'Métricas de entrega',
      description:
        'Totales por estado y tasa de éxito por canal (email, push, sms), en total y por categoría, dentro del rango.\n\n' +
        '**Acceso:** permiso notificationResend:READ.',
      operationId: 'adminNotificationDeliveryMetrics',
      security: [{ bearerAuth: [] }, { idTokenAuth: [] }],
      parameters: toParameters(DeliveryMetricsQuery, 'query'),
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/NotificationDeliveryMetrics' },
          'Métricas de entregas de notificaciones obtenidas exitosamente.'
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
      parameters: toParameters(DeliveryIdParams, 'path'),
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
        ...toParameters(DeliveryIdParams, 'path'),
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
