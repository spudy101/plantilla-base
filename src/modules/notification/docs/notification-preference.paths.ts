// config/swagger/modules/shared-endpoints/kyc/person/notification-preference.paths.ts

import commonResponses from '../../../config/swagger/responses/common.responses';
import { jsonBody, toOpenApi, toParameters } from '../../../shared/validation/openapi';
import { CategoryCodeParams, UpdatePreferenceBody } from '../requests/notification.request';
import { CategoryPreferenceViewSchema, PreferenceDeletedSchema } from '../responses/notification-preference.response';

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

// Generados desde los esquemas Zod de requests/ y responses/.
const schemas = {
  UpdatePreferenceRequest: toOpenApi(UpdatePreferenceBody),
  CategoryPreferenceView: toOpenApi(CategoryPreferenceViewSchema, 'output'),
  PreferenceDeleted: toOpenApi(PreferenceDeletedSchema, 'output')
};

// ─── Paths ────────────────────────────────────────────────────

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
      requestBody: jsonBody('UpdatePreferenceRequest'),
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
      parameters: toParameters(CategoryCodeParams, 'path'),
      requestBody: jsonBody('UpdatePreferenceRequest'),
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
      parameters: toParameters(CategoryCodeParams, 'path'),
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/PreferenceDeleted' },
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

export default { paths, schemas };
