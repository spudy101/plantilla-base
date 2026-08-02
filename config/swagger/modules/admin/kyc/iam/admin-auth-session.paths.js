const commonResponses = require('../../../../responses/common.responses');

/**
 * ============================================================
 * ADMIN AUTH SESSION PATHS  —  RF-ADM-03
 * ============================================================
 * Módulo: /admin/api/v1/auth
 * Roles: GET → ADMIN_ACCESS_ROLES + AUDITOR_INTERNO (solo lectura); PATCH revoke → solo ADMIN_ACCESS_ROLES
 *
 * Rutas:
 *   GET    /admin/api/v1/auth/sessions
 *   GET    /admin/api/v1/auth/sessions/user/:userId
 *   PATCH  /admin/api/v1/auth/sessions/:sessionId/revoke
 *   GET    /admin/api/v1/auth/attempts
 *   GET    /admin/api/v1/auth/attempts/user/:userId
 */

const schemas = {
  AdminSessionDevice: {
    type: 'object',
    nullable: true,
    description: 'Dispositivo asociado a la sesión.',
    properties: {
      deviceId: { type: 'string', format: 'uuid' },
      deviceName: { type: 'string', example: 'Chrome en Windows' },
      deviceType: { type: 'string', nullable: true, example: 'Desktop' },
      browser: { type: 'string', nullable: true, example: 'Chrome' },
      os: { type: 'string', nullable: true, example: 'Windows 11' },
      status: { type: 'string', enum: ['pending', 'trusted', 'blocked'] }
    }
  },

  AdminSession: {
    type: 'object',
    description: 'Sesión de usuario con información del dispositivo asociado.',
    properties: {
      sessionId: { type: 'string', format: 'uuid' },
      userId: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: ['active', 'closed'] },
      ipAddress: { type: 'string', nullable: true, example: '192.168.1.1' },
      userAgent: { type: 'string', nullable: true, example: 'Mozilla/5.0...' },
      startedAt: { type: 'string', format: 'date-time' },
      lastAccessAt: { type: 'string', format: 'date-time' },
      closedAt: { type: 'string', format: 'date-time', nullable: true },
      closeReason: {
        type: 'string',
        nullable: true,
        example: 'revoked_by_admin',
        description:
          'Razón de cierre: logout, logout_all, logout_others, session_limit, password_reset, closed_by_user, reauth_same_device, revoked_by_admin.'
      },
      createdAt: { type: 'string', format: 'date-time' },
      user: {
        type: 'object',
        nullable: true,
        description: 'Información del usuario dueño de la sesión.',
        properties: {
          userId: { type: 'string', format: 'uuid' },
          username: { type: 'string', example: 'jdoe' },
          fullName: { type: 'string', nullable: true, example: 'John Doe' }
        }
      },
      device: { $ref: '#/components/schemas/AdminSessionDevice' }
    }
  },

  AuthAttempt: {
    type: 'object',
    description: 'Registro de auditoría de un intento de autenticación.',
    properties: {
      auditLogId: { type: 'string', format: 'uuid' },
      action: { type: 'string', example: 'LOGIN_SUCCESS', description: 'Acción registrada en el log de auditoría.' },
      description: { type: 'string', nullable: true },
      outcome: { type: 'string', enum: ['success', 'failure', 'warning', 'attempt'] },
      risk: { type: 'string', nullable: true, example: 'low' },
      userId: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description: 'ID del usuario asociado al intento (null si no se resolvió).'
      },
      user: {
        type: 'object',
        nullable: true,
        description: 'Información del usuario asociado al intento (null cuando el intento no tiene usuario resuelto).',
        properties: {
          userId: { type: 'string', format: 'uuid' },
          username: { type: 'string', example: 'jdoe' },
          fullName: { type: 'string', nullable: true, example: 'John Doe' }
        }
      },
      ipAddress: { type: 'string', nullable: true, example: '200.115.12.34' },
      userAgent: { type: 'string', nullable: true },
      timestamp: { type: 'string', format: 'date-time' },
      errorMessage: { type: 'string', nullable: true }
    }
  }
};

const scopeParam = {
  name: 'scope',
  in: 'query',
  schema: { type: 'string', enum: ['all', 'login'], default: 'all' },
  description:
    'Alcance del listado: `all` (default) devuelve todos los eventos de la categoría Autenticación; ' +
    '`login` acota solo a intentos de inicio de sesión (LOGIN_SUCCESS, LOGIN_FAILED, LOGIN_BLOCKED_DEVICE, ' +
    'LOGIN_BLOCKED_POLICY_UPDATE, ACCOUNT_BLOCKED, REFRESH_TOKEN_REUSE_ATTACK).'
};

const userIdParam = {
  name: 'userId',
  in: 'path',
  required: true,
  description: 'UUID del usuario.',
  schema: { type: 'string', format: 'uuid' }
};

const sessionIdParam = {
  name: 'sessionId',
  in: 'path',
  required: true,
  description: 'UUID de la sesión.',
  schema: { type: 'string', format: 'uuid' }
};

const paginationParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Número de página.' },
  { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 }, description: 'Registros por página.' },
  { name: 'sortBy', in: 'query', schema: { type: 'string' }, description: 'Campo por el cual ordenar.' },
  {
    name: 'order',
    in: 'query',
    schema: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC' },
    description: 'Dirección del ordenamiento.'
  }
];

const dateRangeParams = [
  {
    name: 'dateFrom',
    in: 'query',
    schema: { type: 'string', format: 'date-time' },
    description: 'Filtrar desde esta fecha (ISO 8601).'
  },
  {
    name: 'dateTo',
    in: 'query',
    schema: { type: 'string', format: 'date-time' },
    description: 'Filtrar hasta esta fecha (ISO 8601).'
  }
];

const paths = {
  '/admin/api/v1/auth/sessions': {
    get: {
      tags: ['Admin - Auditoría / Sesiones'],
      summary: 'Listar sesiones (paginado)',
      operationId: 'adminListSessions',
      description:
        'Lista paginada de todas las sesiones de usuario. Soporta filtros por sesión, usuario, estado y rango de fechas.\n\n**Acceso:** SUPERADMIN, ADMIN_PRODUCTOS y AUDITOR_INTERNO (solo lectura).',
      parameters: [
        ...paginationParams,
        {
          name: 'sessionId',
          in: 'query',
          schema: { type: 'string', format: 'uuid' },
          description: 'Filtrar por sesión específica (UUID de la sesión).'
        },
        {
          name: 'userId',
          in: 'query',
          schema: { type: 'string', format: 'uuid' },
          description: 'Filtrar por usuario específico.'
        },
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string', enum: ['active', 'closed'] },
          description: 'Filtrar por estado de sesión.'
        },
        ...dateRangeParams
      ],
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/AdminSession' }, 'Lista de sesiones obtenida exitosamente.'),
        ...commonResponses.ValidationError,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/auth/sessions/user/{userId}': {
    get: {
      tags: ['Admin - Auditoría / Sesiones'],
      summary: 'Sesiones de un usuario específico',
      operationId: 'adminGetSessionsByUser',
      parameters: [
        userIdParam,
        ...paginationParams,
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string', enum: ['active', 'closed'] },
          description: 'Filtrar por estado.'
        }
      ],
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/AdminSession' }, 'Sesiones del usuario obtenidas.'),
        ...commonResponses.ValidationError,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/auth/sessions/{sessionId}/revoke': {
    patch: {
      tags: ['Admin - Auditoría / Sesiones'],
      summary: 'Revocar sesión activa (cierre forzado)',
      operationId: 'adminRevokeSession',
      description: `Cierra forzosamente una sesión activa:
1. Cierra la sesión en BD con razón \`revoked_by_admin\`.
2. Revoca el JTI del refresh token en Redis.
3. Invalida los access tokens **de esa sesión** en Redis (quedan rechazados en el próximo request).

El usuario es deslogueado de esa sesión de forma inmediata. **Las demás sesiones del usuario no se ven afectadas**
(la invalidación es por sesión, no global): si tiene la sesión abierta en otro dispositivo, sigue trabajando ahí.

Si el cliente de la sesión revocada intenta renovar, recibe 401 con \`details.code = SESSION_CLOSED\`.`,
      parameters: [sessionIdParam],
      responses: {
        200: commonResponses.ok(
          {
            type: 'object',
            properties: {
              sessionId: { type: 'string', format: 'uuid' },
              status: { type: 'string', example: 'closed' }
            }
          },
          'Sesión revocada exitosamente.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.NotFound,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/auth/attempts': {
    get: {
      tags: ['Admin - Auditoría / Sesiones'],
      summary: 'Historial de intentos de autenticación',
      operationId: 'adminListAttempts',
      description:
        'Lista paginada del log de auditoría de autenticación.\n\n' +
        'Por defecto (`scope=all`) devuelve todos los eventos de la categoría Autenticación ' +
        '(logins, MFA, dispositivos, sesiones, etc.). Con `scope=login` se acota solo a intentos ' +
        'de inicio de sesión. Cada registro incluye el objeto `user` (usuario asociado, o null).',
      parameters: [
        ...paginationParams,
        {
          name: 'userId',
          in: 'query',
          schema: { type: 'string', format: 'uuid' },
          description: 'Filtrar por usuario específico.'
        },
        scopeParam,
        {
          name: 'outcome',
          in: 'query',
          schema: { type: 'string', enum: ['success', 'failure', 'warning', 'attempt'] },
          description: 'Filtrar por resultado del intento.'
        },
        ...dateRangeParams
      ],
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/AuthAttempt' }, 'Historial de intentos obtenido.'),
        ...commonResponses.ValidationError,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/auth/attempts/user/{userId}': {
    get: {
      tags: ['Admin - Auditoría / Sesiones'],
      summary: 'Intentos de autenticación de un usuario',
      operationId: 'adminGetAttemptsByUser',
      description:
        'Eventos de autenticación de un usuario específico. Por defecto (`scope=all`) devuelve toda la ' +
        'categoría Autenticación; con `scope=login` se acota solo a intentos de inicio de sesión. ' +
        'Cada registro incluye el objeto `user`.',
      parameters: [
        userIdParam,
        ...paginationParams,
        scopeParam,
        {
          name: 'outcome',
          in: 'query',
          schema: { type: 'string', enum: ['success', 'failure', 'warning', 'attempt'] },
          description: 'Filtrar por resultado.'
        },
        ...dateRangeParams
      ],
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/AuthAttempt' }, 'Intentos del usuario obtenidos.'),
        ...commonResponses.ValidationError,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.InternalServerError
      }
    }
  }
};

module.exports = { paths, schemas };
