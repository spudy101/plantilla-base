// config/swagger/modules/shared-endpoints/notification/notification.paths.ts

import commonResponses from '../../../config/swagger/responses/common.responses';

/**
 * ============================================================
 * NOTIFICATION PATHS — SHARED ENDPOINTS
 * ============================================================
 * Disponible en: servidor client y servidor admin
 * Autenticación estándar: bearerAuth + idTokenAuth
 * Excepción: POST /notifications usa X-API-Key (apiKeyAuth)
 *
 * Rutas:
 *   GET  /client/api/v1/notification/count/stream         → SSE: stream de no leídas en tiempo real
 *   GET  /client/api/v1/notification/count                → conteo puntual
 *   POST /client/api/v1/notification/notifications        → creación externa vía X-API-Key
 *   GET  /client/api/v1/notification/notifications        → bandeja mixta paginada (personal + global)
 *   GET  /client/api/v1/notification/notifications/personal → solo notificaciones personales
 *   GET  /client/api/v1/notification/notifications/global   → solo notificaciones globales
 */

// ─── Schemas propios del módulo ───────────────────────────────

const schemas = {
  /**
   * Body para POST /notifications (autenticación X-API-Key, uso de servicios externos).
   * Refleja los parámetros de NotificationCreationService.crearNotificacion().
   */
  NotificationCreateRequest: {
    type: 'object',
    required: ['tipoNotificacion', 'userId'],
    properties: {
      tipoNotificacion: {
        type: 'string',
        example: 'OPERATION_APPROVED',
        description: 'Código del tipo de notificación (campo `code` en `notification_types`).'
      },
      userId: {
        type: 'string',
        format: 'uuid',
        description: 'UUID del usuario destinatario.'
      },
      relatedEntity: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description: 'UUID de la entidad relacionada (ej: operation_id).'
      },
      metadata: {
        type: 'object',
        nullable: true,
        additionalProperties: true,
        description: 'Variables de reemplazo para los templates del tipo de notificación (ej: `{ nombre, monto, logoUrl }`).'
      }
    }
  },

  /**
   * Ítem de la bandeja mixta (GET /notifications).
   * Discriminado por `type`: personal → Notification, global → GlobalNotification.
   */
  NotificationMixedItem: {
    description:
      'Ítem de la bandeja mixta. El campo `type` indica el origen: `personal` (notificación directa al usuario) o `global` (emitida para todos los usuarios).',
    oneOf: [
      {
        title: 'Personal',
        allOf: [
          { $ref: '#/components/schemas/Notification' },
          {
            type: 'object',
            required: ['type'],
            properties: {
              type: { type: 'string', enum: ['personal'] }
            }
          }
        ]
      },
      {
        title: 'Global',
        allOf: [
          { $ref: '#/components/schemas/GlobalNotification' },
          {
            type: 'object',
            required: ['type'],
            properties: {
              type: { type: 'string', enum: ['global'] }
            }
          }
        ]
      }
    ],
    discriminator: {
      propertyName: 'type'
    }
  },

  /** Respuesta de GET /notifications/count y valor inicial del stream SSE. */
  UnreadCountResponse: {
    type: 'object',
    properties: {
      count: {
        type: 'integer',
        minimum: 0,
        example: 5,
        description: 'Total de notificaciones no leídas del usuario (personales + globales).'
      }
    }
  }
};

// ─── Parámetros de paginación comunes ────────────────────────

const paginationParams = [
  {
    name: 'page',
    in: 'query',
    schema: { type: 'integer', minimum: 1, default: 1 },
    description: 'Número de página.'
  },
  {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, default: 10 },
    description: 'Ítems por página.'
  },
  {
    name: 'search',
    in: 'query',
    schema: { type: 'string' },
    description: 'Búsqueda por título o cuerpo de la notificación.'
  },
  {
    name: 'sortBy',
    in: 'query',
    schema: { type: 'string', default: 'createdAt' },
    description: 'Campo de ordenamiento.'
  },
  {
    name: 'order',
    in: 'query',
    schema: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC' },
    description: 'Dirección del ordenamiento.'
  }
];

// ─── Paths ────────────────────────────────────────────────────

const paths = {
  // ── GET /client/api/v1/notification/count/stream — SSE ───────
  '/client/api/v1/notification/count/stream': {
    get: {
      tags: ['Notifications'],
      summary: 'Stream en tiempo real del conteo de no leídas (SSE)',
      operationId: 'streamUnreadCount',
      description: [
        'Establece una conexión **Server-Sent Events (SSE)** permanente.',
        '',
        'Al conectarse se emite el conteo inicial de notificaciones no leídas. Cada vez que el',
        'conteo cambia (nueva notificación recibida, notificación leída) se emite un nuevo evento:',
        '```',
        'data: {"count":5}',
        '',
        '```',
        'El cliente debe cerrar la conexión (`EventSource.close()`) cuando ya no la necesite.',
        '',
        '⚠️ Este endpoint **no devuelve JSON** — el `Content-Type` es `text/event-stream`.'
      ].join('\n'),
      responses: {
        200: {
          description: 'Stream SSE establecido. La conexión se mantiene abierta.',
          content: {
            'text/event-stream': {
              schema: {
                type: 'string',
                example: 'data: {"count":5}\n\n'
              }
            }
          }
        },
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── GET /client/api/v1/notification/count ────────────────────
  '/client/api/v1/notification/count': {
    get: {
      tags: ['Notifications'],
      summary: 'Conteo puntual de notificaciones no leídas',
      operationId: 'getUnreadCount',
      description:
        'Devuelve el total actual de notificaciones no leídas del usuario autenticado (personales + globales). Usar `GET /notifications/count/stream` para recibir actualizaciones en tiempo real sin polling.',
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/UnreadCountResponse' },
          'Conteo de notificaciones no leídas obtenido exitosamente.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /client/api/v1/notification/notifications (X-API-Key) + GET (mixta) ──
  '/client/api/v1/notification/notifications': {
    post: {
      tags: ['Notifications'],
      summary: 'Crear notificación (uso exclusivo de servicios externos)',
      operationId: 'createNotification',
      security: [{ apiKeyAuth: [] }],
      description: [
        '**Autenticación:** `X-API-Key` (header `x-api-key`). No requiere JWT.',
        '',
        'Endpoint destinado a servicios internos o externos que necesiten disparar una notificación',
        'para un usuario. El tipo de notificación (`tipoNotificacion`) debe existir en la tabla',
        '`notification_types` con el `code` indicado.',
        '',
        'La notificación se encola en el worker y se envía según la configuración del tipo',
        '(push, email) y las preferencias del usuario destinatario.'
      ].join('\n'),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/NotificationCreateRequest' }
          }
        }
      },
      responses: {
        201: commonResponses.created(
          { type: 'object', nullable: true },
          'Notificación encolada exitosamente en el worker de notificaciones.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    },

    get: {
      tags: ['Notifications'],
      summary: 'Bandeja mixta de notificaciones paginada (personal + global)',
      operationId: 'getNotificationsList',
      description: [
        'Devuelve las notificaciones personales y globales mezcladas, ordenadas por fecha.',
        '',
        'Las notificaciones de la página actual se marcan automáticamente como leídas.',
        '',
        'Cada ítem incluye el campo `type` para discriminar entre `personal` y `global`.'
      ].join('\n'),
      parameters: paginationParams,
      responses: {
        200: commonResponses.paginated(
          { $ref: '#/components/schemas/NotificationMixedItem' },
          'Bandeja mixta de notificaciones obtenida exitosamente.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── GET /client/api/v1/notification/notifications/personal ───
  '/client/api/v1/notification/notifications/personal': {
    get: {
      tags: ['Notifications'],
      summary: 'Listado de notificaciones personales',
      operationId: 'getPersonalNotifications',
      description:
        'Solo notificaciones dirigidas directamente al usuario autenticado. Soporta búsqueda por título o cuerpo. Las notificaciones de la página se marcan automáticamente como leídas.',
      parameters: paginationParams,
      responses: {
        200: commonResponses.paginated(
          { $ref: '#/components/schemas/Notification' },
          'Notificaciones personales obtenidas exitosamente.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── GET /client/api/v1/notification/notifications/global ─────
  '/client/api/v1/notification/notifications/global': {
    get: {
      tags: ['Notifications'],
      summary: 'Listado de notificaciones globales',
      operationId: 'getGlobalNotifications',
      description: [
        'Notificaciones emitidas para todos los usuarios (o un rol objetivo).',
        '',
        'El campo `isRead` refleja si el usuario autenticado ya leyó esa notificación global.',
        'Las notificaciones de la página se marcan como leídas automáticamente.'
      ].join('\n'),
      parameters: paginationParams,
      responses: {
        200: commonResponses.paginated(
          { $ref: '#/components/schemas/GlobalNotification' },
          'Notificaciones globales obtenidas exitosamente.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  }
};

export default { paths, schemas };
