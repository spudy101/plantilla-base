// config/swagger/modules/client/records/audit/user-activity.paths.ts

import commonResponses from '../../../../responses/common.responses';

/**
 * ============================================================
 * USER ACTIVITY PATHS — CLIENT
 * ============================================================
 * Módulo: /client/api/v1/records/audit/recent-activity
 * Feed de actividad reciente del PROPIO usuario autenticado (roles CLIENTE / CLIENTE_VERIFICADO).
 *
 * Client-safe: mezcla `audit_logs` (acciones del propio usuario) y `user_change_logs` (cambios de
 * cuenta/perfil, incluidos los hechos por un admin o por el sistema) SIN exponer nunca `details`
 * (before/after), `previous_value`/`new_value`, user_agent ni datos de terceros.
 *
 * Rutas:
 *   GET /client/api/v1/records/audit/recent-activity
 */

const clientSecurity = [{ bearerAuth: [], idTokenAuth: [] }];

// ─── Schemas ──────────────────────────────────────────────────

const schemas = {
  UserActivityItem: {
    type: 'object',
    description: 'Evento del feed de actividad del propio usuario (fusión de audit_logs + user_change_logs).',
    properties: {
      activityId: {
        type: 'string',
        format: 'uuid',
        description: 'ID del registro en su tabla de origen (audit_log_id o log_id según `source`).'
      },
      source: {
        type: 'string',
        enum: ['audit_log', 'user_change_log'],
        description: `Tabla de origen del evento:
- \`audit_log\`       → acción del propio usuario (login, consultas, operaciones)
- \`user_change_log\` → cambio en los datos de la cuenta/perfil (puede haberlo hecho el usuario, un admin o el sistema)`
      },
      action: {
        type: 'string',
        description:
          'Código de la acción. Para `audit_log` es la acción de auditoría (ej. `LOGIN_SUCCESS`); para ' +
          '`user_change_log` es el tipo de cambio (ej. `email`, `password`, `phone`).',
        example: 'LOGIN_SUCCESS'
      },
      description: {
        type: 'string',
        nullable: true,
        description: 'Descripción legible del evento, en español.',
        example: 'Actualización del correo electrónico'
      },
      category: {
        type: 'string',
        nullable: true,
        description: 'Categoría del evento. En los eventos de `user_change_log` siempre es `profile`.',
        example: 'profile'
      },
      outcome: {
        type: 'string',
        nullable: true,
        enum: ['success', 'failure', 'warning', 'attempt', null],
        description: 'Desenlace del evento. En los eventos de `user_change_log` siempre es `success`.',
        example: 'success'
      },
      changedByRole: {
        type: 'string',
        enum: ['user', 'admin', 'system'],
        description:
          'Quién originó el evento. En los eventos de `audit_log` siempre es `user`; en `user_change_log` ' +
          'puede ser `user`, `admin` o `system`.',
        example: 'user'
      },
      ip: {
        type: 'string',
        nullable: true,
        description: 'IP desde la que se ejecutó la acción. Siempre null en los eventos de `user_change_log`.',
        example: '190.85.10.20'
      },
      device: {
        type: 'object',
        nullable: true,
        description:
          'Dispositivo de confianza que ejecutó la acción (sesión → dispositivo). Solo se resuelve para sesiones del ' +
          'PROPIO usuario: los cambios hechos por un administrador o el sistema salen con device null (el equipo de un ' +
          'tercero nunca se expone). También es null si la sesión no tiene dispositivo asociado.',
        properties: {
          deviceId: { type: 'string', format: 'uuid', description: 'Id del dispositivo de confianza.' },
          name: { type: 'string', nullable: true, description: 'Nombre del dispositivo (el que el usuario le puso).', example: 'iPhone de Camilo' }
        }
      },
      occurredAt: { type: 'string', format: 'date-time', description: 'Momento del evento.' }
    }
  }
};

// ─── Paths ────────────────────────────────────────────────────

const paths = {
  '/client/api/v1/records/audit/recent-activity': {
    get: {
      tags: ['Cliente — Actividad Reciente'],
      summary: 'Actividad reciente del propio usuario',
      operationId: 'clientGetRecentActivity',
      description: `Feed paginado de la actividad reciente del usuario autenticado, del evento más reciente al más antiguo.

Fusiona dos fuentes (campo \`source\` de cada ítem):
- \`audit_log\` → acciones ejecutadas por el propio usuario (login, consultas, operaciones).
- \`user_change_log\` → cambios en los datos de su cuenta/perfil; \`changedByRole\` indica si lo hizo el propio usuario, un administrador o el sistema.

**Client-safe:** nunca expone el detalle técnico de los cambios (valores anteriores/nuevos), user agent ni datos de terceros — solo el código de la acción, una descripción legible y el desenlace.`,
      security: clientSecurity,
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } }
      ],
      responses: {
        200: commonResponses.paginated(
          { $ref: '#/components/schemas/UserActivityItem' },
          'Actividad reciente obtenida exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  }
};

export default { paths, schemas };
