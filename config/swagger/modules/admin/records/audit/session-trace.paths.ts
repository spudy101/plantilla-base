import commonResponses from '../../../../responses/common.responses';

/**
 * ============================================================
 * SESSION TRACE PATHS — ADMIN  (Fase 5 — API admin de sesiones / trazabilidad)
 * ============================================================
 * Módulo: /admin/api/v1/records/audit/sessions
 * RBAC: globalLogs (READ) — mismo módulo que /records/audit/audit-logs.
 * Roles: SUPERADMIN, AUDITOR_INTERNO (solo lectura).
 *
 * Superficie forense (NO confundir con /auth/sessions, que es *control* de sesión).
 * El timeline sale de audit_logs (session_id + entity_table/entity_id); la hidratación reusa
 * los DTOs admin existentes, un findAll por tabla involucrada.
 *
 * Rutas:
 *   GET /admin/api/v1/records/audit/sessions
 *   GET /admin/api/v1/records/audit/sessions/{sessionId}
 *   GET /admin/api/v1/records/audit/sessions/{sessionId}/entities
 */

const schemas = {
  SessionTraceListItem: {
    type: 'object',
    description: 'Sesión con su conteo de acciones (join user_sessions + audit_logs).',
    properties: {
      sessionId: { type: 'string', format: 'uuid' },
      userId: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: ['active', 'closed'] },
      ipAddress: { type: 'string', nullable: true, example: '190.114.45.227' },
      userAgent: { type: 'string', nullable: true },
      startedAt: { type: 'string', format: 'date-time' },
      lastAccessAt: { type: 'string', format: 'date-time' },
      closedAt: { type: 'string', format: 'date-time', nullable: true },
      closeReason: { type: 'string', nullable: true, example: 'revoked_by_admin' },
      createdAt: { type: 'string', format: 'date-time' },
      actionCount: {
        type: 'integer',
        example: 12,
        description: 'Cantidad de eventos de auditoría originados en esta sesión.'
      },
      user: {
        type: 'object',
        nullable: true,
        properties: {
          userId: { type: 'string', format: 'uuid' },
          username: { type: 'string', example: 'juan.perez' },
          fullName: { type: 'string', nullable: true, example: 'Juan Pérez' }
        }
      },
      device: {
        type: 'object',
        nullable: true,
        properties: {
          deviceId: { type: 'string', format: 'uuid' },
          deviceName: { type: 'string', nullable: true },
          deviceType: { type: 'string', nullable: true, example: 'desktop' },
          browser: { type: 'string', nullable: true, example: 'Chrome' },
          os: { type: 'string', nullable: true, example: 'Windows' },
          status: { type: 'string', nullable: true }
        }
      }
    }
  },

  SessionTimelineEvent: {
    type: 'object',
    description: 'Evento del timeline de una sesión (fila de audit_logs) + flag de hidratación.',
    properties: {
      auditLogId: { type: 'string', format: 'uuid' },
      action: { type: 'string', example: 'CONSENT_GRANTED' },
      description: { type: 'string', nullable: true, example: 'Consentimiento de centrales otorgado' },
      category: { type: 'string', nullable: true, example: 'Legal' },
      module: { type: 'string', nullable: true, example: 'client' },
      risk: { type: 'string', enum: ['low', 'medium', 'high', 'critical', 'unknown'] },
      outcome: { type: 'string', enum: ['success', 'failure', 'warning', 'attempt'] },
      userId: { type: 'string', format: 'uuid', nullable: true },
      sessionId: { type: 'string', format: 'uuid', nullable: true },
      executor: {
        type: 'object',
        nullable: true,
        properties: {
          userId: { type: 'string', format: 'uuid' },
          username: { type: 'string' },
          fullName: { type: 'string', nullable: true }
        }
      },
      entityId: { type: 'string', nullable: true, description: 'ID de la fila de dominio afectada.' },
      entityType: { type: 'string', nullable: true, example: 'UserConsent' },
      entityTable: { type: 'string', nullable: true, example: 'user_consents' },
      method: { type: 'string', nullable: true, example: 'POST' },
      path: { type: 'string', nullable: true },
      ip: { type: 'string', nullable: true },
      source: { type: 'string', enum: ['http', 'worker', 'system', 'unknown'] },
      createdAt: { type: 'string', format: 'date-time' },
      hasDetail: {
        type: 'boolean',
        description: 'true si la fila de dominio referenciada es hidratable (tabla registrada + entity_id presente).'
      }
    }
  },

  SessionTimelineResponse: {
    type: 'object',
    description: 'Cabecera de la sesión + timeline cronológico paginado.',
    properties: {
      session: { $ref: '#/components/schemas/SessionTraceListItem' },
      timeline: { type: 'array', items: { $ref: '#/components/schemas/SessionTimelineEvent' } },
      metadata: { $ref: '#/components/schemas/Metadata' }
    }
  },

  SessionEntityGroup: {
    type: 'object',
    description: 'Filas de dominio de una tabla, referenciadas por el timeline de la sesión.',
    properties: {
      entityTable: { type: 'string', example: 'user_trusted_devices' },
      entityType: { type: 'string', example: 'UserTrustedDevice' },
      count: { type: 'integer', example: 2 },
      items: {
        type: 'array',
        description: 'Filas hidratadas con el DTO admin de cada dominio (shape según la tabla).',
        items: { type: 'object', additionalProperties: true }
      }
    }
  },

  SessionEntitiesResponse: {
    type: 'object',
    description: 'Hidratación por lote de las entidades de dominio tocadas en la sesión.',
    properties: {
      sessionId: { type: 'string', format: 'uuid' },
      entities: { type: 'array', items: { $ref: '#/components/schemas/SessionEntityGroup' } },
      skipped: {
        type: 'array',
        description: 'Tablas referenciadas pero aún no registradas en el registry de hidratación.',
        items: {
          type: 'object',
          properties: {
            entityTable: { type: 'string', example: 'notifications' },
            count: { type: 'integer', example: 1 }
          }
        }
      }
    }
  }
};

const paginationParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
  { name: 'sortBy', in: 'query', schema: { type: 'string', default: 'created_at' } },
  { name: 'order', in: 'query', schema: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC' } }
];

const sessionIdParam = {
  name: 'sessionId',
  in: 'path',
  required: true,
  description: 'UUID de la sesión (user_sessions.user_session_id).',
  schema: { type: 'string', format: 'uuid' }
};

const paths = {
  '/admin/api/v1/records/audit/sessions': {
    get: {
      tags: ['Admin - Auditoría / Sesiones'],
      summary: 'Listar sesiones con conteo de acciones (paginado)',
      operationId: 'adminListSessionTraces',
      description: `Listado forense de sesiones (join \`user_sessions\`) con el **conteo de acciones** que cada una
originó en \`audit_logs\`.

**Acceso:** SUPERADMIN y AUDITOR_INTERNO (solo lectura). Módulo RBAC \`globalLogs\`.

No confundir con \`/auth/sessions\` (módulo \`activeSessions\`), que es *control* de sesión (ver/revocar).`,
      parameters: [
        ...paginationParams,
        { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Filtrar por usuario.' },
        { name: 'sessionId', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Filtrar por sesión.' },
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string', enum: ['active', 'closed'] },
          description: 'Estado de la sesión.'
        },
        { name: 'ip', in: 'query', schema: { type: 'string', maxLength: 45 }, description: 'IP de origen de la sesión.' },
        { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Desde (ISO 8601).' },
        { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Hasta (ISO 8601).' }
      ],
      responses: {
        200: commonResponses.paginated(
          { $ref: '#/components/schemas/SessionTraceListItem' },
          'Sesiones obtenidas exitosamente.'
        ),
        ...commonResponses.ValidationError,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/records/audit/sessions/{sessionId}': {
    get: {
      tags: ['Admin - Auditoría / Sesiones'],
      summary: 'Traza (timeline) de una sesión',
      operationId: 'adminGetSessionTrace',
      description: `Cabecera de la sesión + **timeline cronológico** (ascendente por \`created_at\`) de todas las
acciones registradas en \`audit_logs\` para esa sesión. Cada evento trae \`entityTable\` + \`entityId\` y un flag
\`hasDetail\` que indica si su fila de dominio es hidratable vía \`/sessions/{sessionId}/entities\`.`,
      parameters: [sessionIdParam, ...paginationParams],
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/SessionTimelineResponse' },
          'Traza de sesión obtenida exitosamente.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/records/audit/sessions/{sessionId}/entities': {
    get: {
      tags: ['Admin - Auditoría / Sesiones'],
      summary: 'Hidratar las filas de dominio de una sesión',
      operationId: 'adminGetSessionEntities',
      description: `Hidratación **perezosa y por lote** de las filas de dominio referenciadas por el timeline de la
sesión: agrupa por tabla y hace **un \`findAll\` por tabla involucrada**, reusando los DTOs admin existentes. Los ids
se derivan de \`audit_logs\` (nunca de input del usuario). Las tablas aún no registradas en el registry vuelven en
\`skipped\`.`,
      parameters: [
        sessionIdParam,
        {
          name: 'entityTable',
          in: 'query',
          schema: { type: 'string', maxLength: 150 },
          description: 'Acota la hidratación a una sola tabla (caso "expandir una fila"). Ej: user_trusted_devices.'
        }
      ],
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/SessionEntitiesResponse' },
          'Entidades de la sesión obtenidas exitosamente.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.InternalServerError
      }
    }
  }
};

export default { paths, schemas };
