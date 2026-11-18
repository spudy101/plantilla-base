import commonResponses from '../../../config/swagger/responses/common.responses';

/**
 * OPERATION PATHS — ADMIN
 * Traza de operaciones: una fila por petición HTTP, webhook, ciclo de worker o tarea de sistema.
 * RBAC: globalLogs (READ).
 *
 *   GET /admin/api/v1/records/audit/operations
 *   GET /admin/api/v1/records/audit/operations/{operationId}
 */

const operationProperties = {
  operationId: { type: 'string', format: 'uuid', description: 'Id de la operación = correlationId de logs y auditoría.' },
  parentId: { type: 'string', format: 'uuid', nullable: true, description: 'Operación que originó esta.' },
  clientRequestId: { type: 'string', nullable: true, description: 'X-Correlation-Id / X-Request-Id que envió el cliente.' },
  source: { type: 'string', enum: ['http', 'webhook', 'worker', 'system'] },
  name: { type: 'string', example: 'PUT /admin/api/v1/kyc/persons/:userId/role' },
  status: { type: 'string', enum: ['running', 'success', 'failure'] },
  httpStatus: { type: 'integer', nullable: true, example: 200 },
  errorCode: { type: 'string', nullable: true },
  errorMessage: { type: 'string', nullable: true },
  userId: { type: 'string', format: 'uuid', nullable: true },
  sessionId: { type: 'string', format: 'uuid', nullable: true },
  ip: { type: 'string', nullable: true },
  startedAt: { type: 'string', format: 'date-time' },
  endedAt: { type: 'string', format: 'date-time', nullable: true },
  durationMs: { type: 'integer', nullable: true }
};

const schemas = {
  Operation: { type: 'object', properties: operationProperties },
  OperationTimeline: {
    type: 'object',
    properties: {
      operation: { $ref: '#/components/schemas/Operation' },
      children: { type: 'array', items: { $ref: '#/components/schemas/Operation' } },
      auditEvents: {
        type: 'array',
        description: 'Hechos de negocio (audit_logs) de la operación, en orden cronológico.',
        items: {
          type: 'object',
          properties: {
            auditLogId: { type: 'string', format: 'uuid' },
            action: { type: 'string' },
            description: { type: 'string', nullable: true },
            outcome: { type: 'string' },
            risk: { type: 'string' },
            userId: { type: 'string', format: 'uuid', nullable: true },
            entityType: { type: 'string', nullable: true },
            entityId: { type: 'string', nullable: true },
            at: { type: 'string', format: 'date-time' }
          }
        }
      },
      externalCalls: {
        type: 'array',
        description: 'Llamadas a proveedores externos (integration_api_logs) hechas dentro de la operación.',
        items: {
          type: 'object',
          properties: {
            apiLogId: { type: 'string', format: 'uuid' },
            product: { type: 'string' },
            endpoint: { type: 'string' },
            result: { type: 'string' },
            responseTimeMs: { type: 'integer', nullable: true },
            errorCode: { type: 'string', nullable: true },
            at: { type: 'string', format: 'date-time' }
          }
        }
      },
      logsQuery: { type: 'string', description: 'Consulta de CloudWatch Logs Insights con los logs paso a paso.' }
    }
  }
};

const TAG = 'Admin - Auditoría / Operaciones';

const paths = {
  '/admin/api/v1/records/audit/operations': {
    get: {
      tags: [TAG],
      summary: 'Listar operaciones (paginado)',
      operationId: 'adminListOperations',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } },
        { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['startedAt', 'durationMs', 'name', 'status'] } },
        { name: 'order', in: 'query', schema: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC' } },
        { name: 'source', in: 'query', schema: { type: 'string', enum: ['http', 'webhook', 'worker', 'system'] } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['running', 'success', 'failure'] } },
        { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'name', in: 'query', schema: { type: 'string', maxLength: 255 }, description: 'Contiene (sin distinguir mayúsculas).' },
        { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date-time' } }
      ],
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/Operation' }, 'Operaciones obtenidas exitosamente.'),
        ...commonResponses.ValidationError,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/records/audit/operations/{operationId}': {
    get: {
      tags: [TAG],
      summary: 'Línea de tiempo de una operación',
      operationId: 'adminGetOperationTimeline',
      description: 'Une por correlationId la operación, sus operaciones hijas, sus hechos de negocio y sus llamadas externas.',
      parameters: [{ name: 'operationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/OperationTimeline' }, 'Línea de tiempo obtenida exitosamente.'),
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
