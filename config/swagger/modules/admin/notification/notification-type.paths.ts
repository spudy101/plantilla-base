// config/swagger/modules/admin/notification/notification-type.paths.ts

import commonResponses = require('../../../responses/common.responses');

/**
 * ============================================================
 * NOTIFICATION TYPE PATHS — ADMIN
 * ============================================================
 * Módulo: /admin/api/v1/notification/notification-types
 * Todos los endpoints requieren rol ADMIN o SUPER_ADMIN.
 *
 * Rutas:
 *   GET   /admin/api/v1/notification/notification-types
 *   POST  /admin/api/v1/notification/notification-types/global
 *   POST  /admin/api/v1/notification/notification-types/direct
 *   PATCH /admin/api/v1/notification/notification-types/:notificationTypeId
 */

// ─── Schemas ──────────────────────────────────────────────────

const schemas = {
  AdminNotificationType: {
    type: 'object',
    description: 'Tipo de notificación con templates completos (solo visible para admin)',
    properties: {
      notificationTypeId: { type: 'string', format: 'uuid' },
      code: {
        type: 'string',
        example: 'PASSWORD_RESET_ADMIN',
        description: 'Identificador único del tipo — clave usada en crearNotificacion()'
      },
      name: {
        type: 'string',
        example: 'Reset de contraseña por administrador',
        description: 'Nombre legible del tipo de notificación'
      },
      description: {
        type: 'string',
        nullable: true,
        example: 'Notificación de reset de contraseña por admin'
      },
      notificationCategoryId: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description: 'Categoría a la que pertenece el tipo. Los canales (push/email/sms), el DND y el layout de email salen de la categoría.'
      },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'urgent'],
        example: 'high',
        nullable: true,
        description: 'Nivel de urgencia del tipo de notificación: low, normal, high o urgent'
      },
      titleTemplate: {
        type: 'string',
        readOnly: true,
        description: 'Template Handlebars para el título de la notificación (read-only — gestionado por seeders)'
      },
      bodyTemplate: {
        type: 'string',
        readOnly: true,
        description: 'Template Handlebars para el cuerpo de la notificación push (read-only — gestionado por seeders)'
      },
      emailSubjectTemplate: {
        type: 'string',
        readOnly: true,
        description: 'Template Handlebars para el asunto del email (read-only — gestionado por seeders)'
      },
      emailBodyTemplate: {
        type: 'string',
        readOnly: true,
        nullable: true,
        description:
          'Template Handlebars (HTML) para el cuerpo del email (read-only). ' +
          'Si es null, el tipo no puede habilitar el envío de email.'
      },
      isActive: { type: 'boolean' },
      // Canales, DND y criticidad viven en la categoría del tipo; se incluye si viene cargada.
      category: { allOf: [{ $ref: '#/components/schemas/NotificationCategory' }], nullable: true },
      updatedAt: { type: 'string', format: 'date-time' }
    }
  },

  AdminNotificationTypeUpdateRequest: {
    type: 'object',
    description: `Todos los campos son opcionales — solo se actualizan los enviados.

Los templates (titleTemplate, bodyTemplate, emailSubjectTemplate, emailBodyTemplate) son **read-only** vía API
(se gestionan por seeders) y no se aceptan en este request. Los canales (push/email/sms), el DND y el layout de
email NO viven en el tipo sino en su **categoría**: para cambiarlos, edita la categoría o reasigna el tipo con
\`notificationCategoryId\`.`,
    properties: {
      name: { type: 'string', nullable: true },
      description: { type: 'string', nullable: true },
      priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], nullable: true },
      notificationCategoryId: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description: 'Reasigna el tipo a otra categoría (fuente de verdad de canales/DND/layout).'
      },
      isActive: { type: 'boolean', nullable: true }
    }
  },

  AdminGlobalNotificationRequest: {
    type: 'object',
    required: ['titulo', 'contenido', 'asunto'],
    properties: {
      titulo: {
        type: 'string',
        example: 'Mantenimiento programado',
        description: 'Título visible en la notificación push'
      },
      contenido: {
        type: 'string',
        example: 'El sistema estará en mantenimiento el sábado de 2am a 4am.',
        description: 'Cuerpo del mensaje'
      },
      asunto: {
        type: 'string',
        example: 'Aviso de mantenimiento — Base Project',
        description: 'Asunto del email'
      }
    }
  },

  AdminGlobalNotificationResponse: {
    type: 'object',
    properties: {
      globalNotificationId: { type: 'string', format: 'uuid' },
      titulo: { type: 'string' },
      contenido: { type: 'string' },
      asunto: { type: 'string' },
      processingStatus: {
        type: 'string',
        example: 'queued',
        description: 'Estado inicial. La notificación se procesa en background.'
      },
      createdAt: { type: 'string', format: 'date-time' }
    }
  },

  AdminDirectNotificationRequest: {
    type: 'object',
    required: ['userId', 'titulo', 'contenido', 'asunto'],
    properties: {
      userId: {
        type: 'string',
        format: 'uuid',
        description: 'UUID del usuario destinatario (debe existir y estar activo)'
      },
      titulo: {
        type: 'string',
        example: 'Tu solicitud fue recibida',
        description: 'Título visible en la notificación push'
      },
      contenido: {
        type: 'string',
        example: 'Hemos recibido tu solicitud y la estamos procesando.',
        description: 'Cuerpo del mensaje'
      },
      asunto: {
        type: 'string',
        example: 'Confirmación de solicitud — Base Project',
        description: 'Asunto del email'
      }
    }
  },

  AdminDirectNotificationResponse: {
    type: 'object',
    properties: {
      notificationId: { type: 'string', format: 'uuid' },
      userId: { type: 'string', format: 'uuid' },
      titulo: { type: 'string' },
      contenido: { type: 'string' },
      asunto: { type: 'string' },
      processingStatus: {
        type: 'string',
        example: 'queued',
        description: 'Estado inicial. La notificación se procesa en background.'
      },
      createdAt: { type: 'string', format: 'date-time' }
    }
  }
};

// ─── Parámetros comunes ────────────────────────────────────────

const notificationTypeIdParam = {
  name: 'notificationTypeId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
  description: 'UUID del tipo de notificación'
};

const paginationParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
  },
  { name: 'sortBy', in: 'query', schema: { type: 'string' } },
  { name: 'order', in: 'query', schema: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC' } }
];

const adminSecurity = [{ bearerAuth: [], idTokenAuth: [] }];

// ─── Paths ────────────────────────────────────────────────────

const paths = {
  '/admin/api/v1/notification/notification-types': {
    get: {
      tags: ['Admin - Tipos de Notificación'],
      summary: 'Listar tipos de notificación',
      operationId: 'adminListNotificationTypes',
      description: `Lista paginada de tipos de notificación con templates completos (campos que el cliente nunca ve).

Útil para revisar y mantener los templates de email (Handlebars HTML) y push.`,
      security: adminSecurity,
      parameters: [
        ...paginationParams,
        {
          name: 'search',
          in: 'query',
          schema: { type: 'string' },
          description: 'Búsqueda de texto libre'
        },
        { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
        {
          name: 'notificationCategoryId',
          in: 'query',
          schema: { type: 'string', format: 'uuid' },
          description: 'Filtra los tipos por la categoría a la que pertenecen'
        },
        { name: 'priority', in: 'query', schema: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] } }
      ],
      responses: {
        200: commonResponses.paginated(
          { $ref: '#/components/schemas/AdminNotificationType' },
          'Tipos de notificación obtenidos exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/notification/notification-types/global': {
    post: {
      tags: ['Admin - Tipos de Notificación'],
      summary: 'Enviar notificación global',
      operationId: 'adminCreateGlobalNotification',
      description: `Envía una notificación masiva a **todos los clientes** (roles \`CLIENTE\` y \`CLIENTE_VERIFICADO\`).
No se envía a usuarios internos.

La notificación se encola (\`processingStatus: queued\`) y se procesa en background — la respuesta es inmediata pero el envío puede tardar dependiendo del volumen de clientes.`,
      security: adminSecurity,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AdminGlobalNotificationRequest' }
          }
        }
      },
      responses: {
        201: commonResponses.created(
          { $ref: '#/components/schemas/AdminGlobalNotificationResponse' },
          'Notificación global encolada exitosamente'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/notification/notification-types/direct': {
    post: {
      tags: ['Admin - Tipos de Notificación'],
      summary: 'Enviar notificación directa a un usuario',
      operationId: 'adminCreateDirectNotification',
      description: `Envía una notificación a **un usuario específico** (no global).

El usuario destinatario debe existir y estar **activo**. La notificación se encola (\`processingStatus: queued\`) y se procesa en background respetando las preferencias y quiet hours del usuario.`,
      security: adminSecurity,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AdminDirectNotificationRequest' }
          }
        }
      },
      responses: {
        201: commonResponses.created(
          { $ref: '#/components/schemas/AdminDirectNotificationResponse' },
          'Notificación directa encolada exitosamente'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/notification/notification-types/{notificationTypeId}': {
    patch: {
      tags: ['Admin - Tipos de Notificación'],
      summary: 'Actualizar tipo de notificación',
      operationId: 'adminUpdateNotificationType',
      description:
        'Actualiza los templates de un tipo de notificación. Todos los campos son opcionales — solo se actualizan los enviados.',
      security: adminSecurity,
      parameters: [notificationTypeIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AdminNotificationTypeUpdateRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/AdminNotificationType' },
          'Tipo de notificación actualizado exitosamente'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  }
};

export = { paths, schemas };
