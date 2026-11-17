// config/swagger/modules/shared-endpoints/kyc/person/notification-preference.paths.ts

import commonResponses = require('../../../../responses/common.responses');

/**
 * ============================================================
 * NOTIFICATION PREFERENCE PATHS — SHARED ENDPOINTS
 * ============================================================
 * Disponible en: servidor client y servidor admin
 * Todos los endpoints requieren autenticación (bearerAuth + idTokenAuth)
 *
 * Las preferencias se atan a la CATEGORÍA de notificación (o global si `notificationCategoryCode`
 * es null). La categoría es la fuente de verdad de canales (push/email/sms) y del "no molestar".
 *
 * Rutas:
 *   GET    /notifications/preferences                        → preferencias crudas (global + overrides)
 *   GET    /notifications/preferences/categories             → categorías + preferencia efectiva
 *   PUT    /notifications/preferences/global                 → upsert preferencia global
 *   PUT    /notifications/preferences/category/{code}        → upsert preferencia de una categoría
 *   DELETE /notifications/preferences/category/{code}        → borrar override (vuelve a la global)
 */

// ─── Schemas propios del módulo ───────────────────────────────

const preferenceFields = {
  allowPush: { type: 'boolean', description: 'Habilitar (`true`) o deshabilitar (`false`) las notificaciones push.' },
  allowEmail: { type: 'boolean', description: 'Habilitar (`true`) o deshabilitar (`false`) las notificaciones por email.' },
  allowSms: { type: 'boolean', description: 'Habilitar (`true`) o deshabilitar (`false`) las notificaciones por SMS.' },
  quietHoursStart: {
    type: 'string',
    nullable: true,
    pattern: '^\\d{2}:\\d{2}(:\\d{2})?$',
    example: '22:00',
    description: 'Inicio del horario silencioso `HH:MM`/`HH:MM:SS`. `null` para desactivar.'
  },
  quietHoursEnd: {
    type: 'string',
    nullable: true,
    pattern: '^\\d{2}:\\d{2}(:\\d{2})?$',
    example: '08:00',
    description:
      'Fin del horario silencioso `HH:MM`/`HH:MM:SS`. Soporta rangos que cruzan medianoche (`22:00` → `08:00`). `null` para desactivar.'
  }
};

const schemas = {
  /** Body para PUT /notifications/preferences/global. Al menos un campo es obligatorio. */
  UpdateGlobalPreferenceRequest: {
    type: 'object',
    description: 'Al menos uno de los campos debe estar presente. Los campos omitidos no se modifican.',
    properties: { ...preferenceFields }
  },

  /** Body para PUT /notifications/preferences/category/{code}. Al menos un campo es obligatorio. */
  UpdateCategoryPreferenceRequest: {
    type: 'object',
    description: 'Al menos uno de los campos debe estar presente. Pisa a la preferencia global para esa categoría.',
    properties: { ...preferenceFields }
  },

  /**
   * Item de la respuesta de GET /notifications/preferences/categories: una categoría activa con la
   * preferencia EFECTIVA del usuario ya resuelta (override de categoría → global → default).
   */
  CategoryPreferenceView: {
    allOf: [
      { $ref: '#/components/schemas/NotificationCategory' },
      {
        type: 'object',
        properties: {
          isSilenceable: {
            type: 'boolean',
            description: 'Si es `false` (categoría crítica o no-silenciable), el front debe ocultar los quiet hours.'
          },
          preference: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                enum: ['category', 'global', 'default'],
                description: 'De dónde salió el valor efectivo: override de la categoría, preferencia global o default.'
              },
              allowPush: { type: 'boolean' },
              allowEmail: { type: 'boolean' },
              allowSms: { type: 'boolean' },
              quietHoursStart: { type: 'string', nullable: true, example: '22:00' },
              quietHoursEnd: { type: 'string', nullable: true, example: '08:00' }
            }
          }
        }
      }
    ]
  }
};

// ─── Paths ────────────────────────────────────────────────────

const categoryCodeParam = {
  name: 'categoryCode',
  in: 'path',
  required: true,
  schema: { type: 'string', pattern: '^[A-Z0-9_]{2,100}$' },
  example: 'SECURITY',
  description: 'Código de la categoría de notificación (MAYÚSCULAS/números/guion bajo).'
};

const paths = {
  // ── GET /notifications/preferences ──
  '/client/api/v1/kyc/person/notifications/preferences': {
    get: {
      tags: ['Notification Preferences'],
      summary: 'Obtener preferencias de notificación del usuario',
      operationId: 'getNotificationPreferences',
      description: [
        'Devuelve las preferencias **almacenadas** del usuario autenticado: la global',
        '(`notificationCategoryCode: null`) más los overrides por categoría que haya configurado.',
        '',
        'Para pintar la pantalla de preferencias conviene usar',
        '`GET /notifications/preferences/categories`, que trae todas las categorías activas con la',
        'preferencia efectiva ya resuelta.'
      ].join('\n'),
      responses: {
        200: commonResponses.ok(
          { type: 'array', items: { $ref: '#/components/schemas/UserNotificationPreference' } },
          'Preferencias de notificación obtenidas exitosamente.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── GET /notifications/preferences/categories ──
  '/client/api/v1/kyc/person/notifications/preferences/categories': {
    get: {
      tags: ['Notification Preferences'],
      summary: 'Listar categorías con la preferencia efectiva del usuario',
      operationId: 'getNotificationCategoriesWithPreferences',
      description: [
        'Devuelve todas las categorías **activas** con la preferencia **efectiva** del usuario ya',
        'resuelta por categoría (override de la categoría → preferencia global → default).',
        '',
        'Cada item incluye los canales que soporta la categoría (`supportsPush/Email/Sms`) e',
        '`isSilenceable` (si es `false`, la categoría es crítica/no-silenciable y se ignoran sus quiet hours).',
        'Es la fuente ideal para renderizar la pantalla de preferencias.'
      ].join('\n'),
      responses: {
        200: commonResponses.ok(
          { type: 'array', items: { $ref: '#/components/schemas/CategoryPreferenceView' } },
          'Categorías de notificación obtenidas exitosamente.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── PUT /notifications/preferences/global ──
  '/client/api/v1/kyc/person/notifications/preferences/global': {
    put: {
      tags: ['Notification Preferences'],
      summary: 'Actualizar preferencia global de notificaciones',
      operationId: 'updateGlobalNotificationPreference',
      description: [
        'Crea o actualiza (upsert) la preferencia global del usuario autenticado.',
        '',
        'La preferencia global (`notificationCategoryCode: null`) aplica a todas las categorías que no',
        'tengan un override específico configurado.',
        '',
        '**Horario silencioso:** si se configuran ambos campos `quietHoursStart` y `quietHoursEnd`, las',
        'notificaciones se difieren fuera de ese rango (salvo categorías críticas/no-silenciables).',
        'Soporta rangos que cruzan medianoche. Para desactivarlo, enviar `null` en ambos.',
        '',
        '⚠️ Al menos uno de los campos (`allowPush`, `allowEmail`, `allowSms`, `quietHoursStart`,',
        '`quietHoursEnd`) debe estar presente.'
      ].join('\n'),
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/UpdateGlobalPreferenceRequest' } }
        }
      },
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/UserNotificationPreference' },
          'Preferencia global actualizada exitosamente.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── PUT / DELETE /notifications/preferences/category/{categoryCode} ──
  '/client/api/v1/kyc/person/notifications/preferences/category/{categoryCode}': {
    put: {
      tags: ['Notification Preferences'],
      summary: 'Actualizar preferencia de una categoría',
      operationId: 'updateCategoryNotificationPreference',
      description: [
        'Crea o actualiza (upsert) la preferencia del usuario para una categoría concreta. Esta',
        'preferencia **pisa a la global** para esa categoría.',
        '',
        '⚠️ Al menos uno de los campos (`allowPush`, `allowEmail`, `allowSms`, `quietHoursStart`,',
        '`quietHoursEnd`) debe estar presente. Devuelve `404` si la categoría no existe o está inactiva.'
      ].join('\n'),
      parameters: [categoryCodeParam],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/UpdateCategoryPreferenceRequest' } }
        }
      },
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/UserNotificationPreference' },
          'Preferencia de categoría actualizada exitosamente.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.NotFound,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    },
    delete: {
      tags: ['Notification Preferences'],
      summary: 'Eliminar la preferencia específica de una categoría',
      operationId: 'deleteCategoryNotificationPreference',
      description: [
        'Elimina el override de la categoría: el usuario vuelve a regirse por su preferencia global',
        'para esa categoría. Devuelve `404` si la categoría no existe o está inactiva.'
      ].join('\n'),
      parameters: [categoryCodeParam],
      responses: {
        200: commonResponses.ok(
          {
            type: 'object',
            properties: { notificationCategoryCode: { type: 'string', example: 'SECURITY' } }
          },
          'Preferencia de categoría eliminada exitosamente.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.NotFound,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  }
};

export = { paths, schemas };
