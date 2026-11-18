import commonResponses from '../../../config/swagger/responses/common.responses';
import piiMaskingDocModule from '../../../config/swagger/schemas/pii-masking.doc';
const { REDACTED_PAYLOAD_DESC } = piiMaskingDocModule;

/**
 * ============================================================
 * AUDIT LOG PATHS — ADMIN  (RF-ADM-03)
 * ============================================================
 * Módulo: /admin/api/v1/records/audit/audit-logs
 * Roles: SUPERADMIN, AUDITOR_INTERNO
 *
 * Rutas:
 *   GET  /admin/api/v1/records/audit/audit-logs
 *   GET  /admin/api/v1/records/audit/audit-logs/export
 *   GET  /admin/api/v1/records/audit/audit-logs/:auditLogId
 */

const schemas = {
  AuditLog: {
    type: 'object',
    description: 'Registro de auditoría del sistema. Inmutable (append-only, Circular 052 SFC).',
    properties: {
      auditLogId: { type: 'string', format: 'uuid' },
      action: { type: 'string', example: 'SCREENING_CREATED', description: 'Código de acción registrada.' },
      description: { type: 'string', nullable: true, example: 'Creación de screening KYC inicial' },
      category: { type: 'string', nullable: true, example: 'KYC' },
      module: {
        type: 'string',
        nullable: true,
        enum: ['admin', 'client', 'system'],
        description: 'Servidor que originó el evento.'
      },
      risk: { type: 'string', enum: ['low', 'medium', 'high', 'critical', 'unknown'] },
      outcome: { type: 'string', enum: ['success', 'failure', 'warning', 'attempt'] },
      userId: { type: 'string', format: 'uuid', nullable: true },
      sessionId: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description:
          'Sesión (user_sessions.user_session_id) desde la que se originó la acción. Null en acciones de worker/sistema.'
      },
      executor: {
        type: 'object',
        nullable: true,
        description: 'Usuario que ejecutó la acción. Null cuando el log fue generado por el sistema o un worker.',
        properties: {
          userId: { type: 'string', format: 'uuid' },
          username: { type: 'string', example: 'admin01' },
          fullName: { type: 'string', nullable: true, example: 'María García' }
        }
      },
      entityId: {
        type: 'string',
        nullable: true,
        example: 'uuid-de-la-entidad',
        description: 'ID de la entidad afectada (columna indexada).'
      },
      entityType: {
        type: 'string',
        nullable: true,
        example: 'Person',
        description: 'Tipo de entidad afectada. Ej: User, Person, Role, ApprovalRequest.'
      },
      entityTable: {
        type: 'string',
        nullable: true,
        example: 'persons',
        description: 'Tabla de BD donde vive la entidad afectada.'
      },
      ip: { type: 'string', nullable: true, example: '190.114.45.227' },
      source: { type: 'string', enum: ['http', 'worker', 'system', 'unknown'] },
      createdAt: { type: 'string', format: 'date-time' }
    }
  },

  AuditLogDetail: {
    allOf: [
      { $ref: '#/components/schemas/AuditLog' },
      {
        type: 'object',
        properties: {
          correlationId: { type: 'string', nullable: true },
          userAgent: { type: 'string', nullable: true },
          fingerprint: { type: 'string', nullable: true },
          details: {
            type: 'object',
            nullable: true,
            description:
              'Datos adicionales específicos de la acción (JSONB). En operaciones de actualización incluye `before` y ' +
              `\`after\` con los campos que cambiaron. ${REDACTED_PAYLOAD_DESC}`,
            properties: {
              before: {
                type: 'object',
                nullable: true,
                additionalProperties: true,
                description: 'Estado de los campos antes del cambio (solo en UPDATEs).'
              },
              after: {
                type: 'object',
                nullable: true,
                additionalProperties: true,
                description: 'Estado de los campos después del cambio (solo en UPDATEs).'
              }
            },
            additionalProperties: true
          }
        }
      }
    ]
  }
};

const paginationParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
  { name: 'sortBy', in: 'query', schema: { type: 'string', default: 'createdAt' } },
  { name: 'order', in: 'query', schema: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC' } }
];

const auditFilters = [
  { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Desde esta fecha (ISO 8601).' },
  { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Hasta esta fecha (ISO 8601).' },
  { name: 'action', in: 'query', schema: { type: 'string', maxLength: 100 }, description: 'Código de acción exacto.' },
  { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Filtrar por usuario.' },
  {
    name: 'sessionId',
    in: 'query',
    schema: { type: 'string', format: 'uuid' },
    description: 'Filtrar por sesión (user_sessions.user_session_id) desde la que se originó la acción.'
  },
  { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Módulo origen (ej: KYC, Autenticación).' },
  {
    name: 'outcome',
    in: 'query',
    schema: { type: 'string', enum: ['success', 'failure', 'warning', 'attempt'] },
    description: 'Resultado de la operación.'
  },
  {
    name: 'risk',
    in: 'query',
    schema: { type: 'string', enum: ['low', 'medium', 'high', 'critical', 'unknown'] },
    description: 'Nivel de riesgo.'
  },
  { name: 'ip', in: 'query', schema: { type: 'string' }, description: 'IP de origen.' },
  { name: 'correlationId', in: 'query', schema: { type: 'string' }, description: 'ID de correlación de la request.' },
  {
    name: 'entityId',
    in: 'query',
    schema: { type: 'string', maxLength: 255 },
    description: 'ID de la entidad afectada (columna `entity_id`, indexada).'
  },
  {
    name: 'entityType',
    in: 'query',
    schema: { type: 'string', maxLength: 100 },
    description: 'Tipo de entidad afectada. Ej: User, Person, Role, ApprovalRequest.'
  },
  {
    name: 'source',
    in: 'query',
    schema: { type: 'string', enum: ['http', 'worker', 'system', 'unknown'] },
    description: 'Origen del evento.'
  },
  {
    name: 'module',
    in: 'query',
    schema: { type: 'string', enum: ['admin', 'client', 'system'] },
    description: 'Servidor que originó el evento.'
  }
];

const auditLogIdParam = {
  name: 'auditLogId',
  in: 'path',
  required: true,
  description: 'UUID del log de auditoría.',
  schema: { type: 'string', format: 'uuid' }
};

const paths = {
  '/admin/api/v1/records/audit/audit-logs': {
    get: {
      tags: ['Admin - Auditoría / Logs'],
      summary: 'Listar logs de auditoría (paginado)',
      operationId: 'adminListAuditLogs',
      description: `Lista paginada de todos los logs de auditoría del sistema.

**Acceso:** SUPERADMIN y AUDITOR_INTERNO (solo lectura).

Los logs son **append-only** (inmutables) — ningún rol puede modificarlos ni eliminarlos (Circular 052 SFC).`,
      parameters: [...paginationParams, ...auditFilters],
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/AuditLog' }, 'Logs de auditoría obtenidos exitosamente.'),
        ...commonResponses.ValidationError,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/records/audit/audit-logs/export': {
    get: {
      tags: ['Admin - Auditoría / Logs'],
      summary: 'Exportar logs de auditoría (CSV / XLSX)',
      operationId: 'adminExportAuditLogs',
      description: `Descarga un archivo con los logs de auditoría que coincidan con los filtros aplicados.

**Formatos:** \`csv\` (default) o \`xlsx\`.
**Límite:** 50 000 filas. Si se supera, la respuesta incluye el header \`X-Export-Truncated: true\`.

**Acceso:** SUPERADMIN y AUDITOR_INTERNO.`,
      parameters: [
        ...auditFilters,
        {
          name: 'format',
          in: 'query',
          schema: { type: 'string', enum: ['csv', 'xlsx'], default: 'csv' },
          description: 'Formato de exportación.'
        }
      ],
      responses: {
        200: {
          description: 'Archivo de exportación generado exitosamente.',
          headers: {
            'Content-Disposition': { schema: { type: 'string', example: 'attachment; filename="audit-logs.csv"' } },
            'X-Export-Truncated': {
              schema: { type: 'string', enum: ['true'] },
              description: 'Presente solo si el resultado superó el límite de 50 000 filas.'
            }
          },
          content: {
            'text/csv': { schema: { type: 'string', format: 'binary' } },
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
              schema: { type: 'string', format: 'binary' }
            }
          }
        },
        ...commonResponses.ValidationError,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/records/audit/audit-logs/{auditLogId}': {
    get: {
      tags: ['Admin - Auditoría / Logs'],
      summary: 'Detalle de un log de auditoría',
      operationId: 'adminGetAuditLog',
      description:
        'Devuelve el detalle completo de un registro de auditoría, incluyendo el campo `details` (JSONB) con los datos específicos de la acción.',
      parameters: [auditLogIdParam],
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/AuditLogDetail' }, 'Log de auditoría obtenido exitosamente.'),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.InternalServerError
      }
    }
  }
};

export default { paths, schemas };
