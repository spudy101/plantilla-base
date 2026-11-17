// config/swagger/modules/admin/core/approval-request.paths.ts
// Doble aprobación global (maker-checker / cuatro ojos).
//
// Módulo: /admin/api/v1/core/approval-requests
//   GET    /admin/api/v1/core/approval-requests           — listar solicitudes (filtros)
//   GET    /admin/api/v1/core/approval-requests/policy     — política: qué operaciones están gateadas
//   GET    /admin/api/v1/core/approval-requests/:id       — detalle (incluye payload propuesto)
//   POST   /admin/api/v1/core/approval-requests/:id/resolve — aprobar / rechazar (checker)
//
// El "estado doble aprobación" de cualquier módulo vive en `approval_requests`.
// Las operaciones gateadas (RBAC, roles, operaciones sobre umbral) responden 202
// con el ApprovalRequest cuando quedan pendientes.

import commonResponses = require('../../../responses/common.responses');

const TAG = 'Admin — Doble Aprobación';

const adminSecurity = [{ bearerAuth: [], idTokenAuth: [] }];

const OPERATION_KEYS = [
  'RBAC_ROLE_CHANGE',
  'CLIENT_ACCOUNT_DELETE',
  'INTERNAL_USER_DELETE'
];
const STATUS_VALUES = ['pending', 'approved', 'rejected', 'expired'];

// ─── Schemas ──────────────────────────────────────────────────

const ApprovalUserRef = {
  type: 'object',
  nullable: true,
  properties: {
    userId: { type: 'string', format: 'uuid' },
    username: { type: 'string', nullable: true },
    firstName: { type: 'string', nullable: true },
    lastName: { type: 'string', nullable: true }
  }
};

const schemas = {
  // Nota: el schema `PendingApproval` (badge en listados) vive en el core compartido
  // (config/swagger/schemas/core.schema.js) para que esté disponible en admin y client.

  ApprovalRequestListItem: {
    type: 'object',
    properties: {
      approvalRequestId: { type: 'string', format: 'uuid' },
      operationKey: { type: 'string', enum: OPERATION_KEYS },
      entityType: { type: 'string', nullable: true, example: 'NotificationType' },
      entityId: { type: 'string', format: 'uuid', nullable: true },
      status: { type: 'string', enum: STATUS_VALUES },
      requestedBy: ApprovalUserRef,
      requestedAt: { type: 'string', format: 'date-time' },
      secondApprover: ApprovalUserRef,
      resolvedAt: { type: 'string', format: 'date-time', nullable: true },
      expiresAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' }
    }
  },

  ApprovalRequest: {
    type: 'object',
    description: 'Detalle de una solicitud de doble aprobación, incluye el payload propuesto.',
    properties: {
      approvalRequestId: { type: 'string', format: 'uuid' },
      operationKey: { type: 'string', enum: OPERATION_KEYS },
      entityType: { type: 'string', nullable: true, example: 'Role' },
      entityId: { type: 'string', format: 'uuid', nullable: true },
      status: { type: 'string', enum: STATUS_VALUES },
      requestedBy: ApprovalUserRef,
      requestedAt: { type: 'string', format: 'date-time' },
      secondApprover: ApprovalUserRef,
      resolvedAt: { type: 'string', format: 'date-time', nullable: true },
      resolutionNotes: { type: 'string', nullable: true },
      expiresAt: { type: 'string', format: 'date-time', nullable: true },
      payload: {
        type: 'object',
        description: 'Datos que el handler registrado usará para ejecutar la acción real al aprobar.',
        additionalProperties: true
      },
      result: {
        type: 'object',
        nullable: true,
        description: 'Salida del handler tras aprobar (ej: id de entidad creada).',
        additionalProperties: true
      },
      originSessionId: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description: 'Sesión de origen sellada al crear la solicitud (trazabilidad, RF-ADM-03). null si la creó un worker.'
      },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' }
    }
  },

  ApprovalPolicy: {
    type: 'object',
    description: 'Política de doble aprobación: operaciones gateadas y sus condiciones.',
    properties: {
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            operationKey: { type: 'string', enum: OPERATION_KEYS },
            label: { type: 'string', example: 'Cambio de rol de usuario' },
            condition: { type: 'string', enum: ['always', 'threshold'] },
            approverRoles: { type: 'array', items: { type: 'string' }, example: ['ADMIN'] },
            entityType: { type: 'string', example: 'User' },
            ttlHours: { type: 'integer', example: 72 },
            thresholdField: { type: 'string', nullable: true, example: 'amount' },
            threshold: { type: 'number', nullable: true, example: 5000000 }
          }
        }
      }
    }
  },

  ApprovalResolveRequest: {
    type: 'object',
    required: ['decision'],
    properties: {
      decision: {
        type: 'string',
        enum: ['approve', 'reject'],
        description: 'Aprobar ejecuta la acción real (handler registrado); rechazar la descarta.'
      },
      notes: {
        type: 'string',
        nullable: true,
        maxLength: 2000,
        description: 'Notas de resolución (opcional).'
      }
    }
  }
};

// ─── Parámetros ───────────────────────────────────────────────

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
  description: 'UUID de la solicitud de aprobación'
};

// ─── Respuestas específicas ───────────────────────────────────

const resolveConflictResponse = {
  409: {
    description: 'La solicitud ya no está pendiente (aprobada, rechazada o expirada) y no puede re-resolverse.',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'La solicitud ya está en estado "approved" y no puede re-resolverse' },
            code: { type: 'string', example: 'APPROVAL_REQUEST_NOT_PENDING' }
          }
        }
      }
    }
  }
};

const resolveForbiddenResponse = {
  403: {
    description:
      'Rol no autorizado para resolver esta operación, o el aprobador es el mismo que originó (segregación de funciones).',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            code: { type: 'string' }
          }
        },
        examples: {
          roleNotAllowed: {
            summary: 'Rol no autorizado',
            value: { message: 'Tu rol no está autorizado a resolver esta operación', code: 'DUAL_APPROVAL_ROLE_NOT_ALLOWED' }
          },
          sameAsMaker: {
            summary: 'Aprobador = maker',
            value: {
              message: 'El segundo aprobador no puede ser el mismo que originó la operación (segregación de funciones)',
              code: 'DUAL_APPROVAL_SAME_AS_MAKER'
            }
          }
        }
      }
    }
  }
};

// ─── Paths ────────────────────────────────────────────────────

const paths = {
  '/admin/api/v1/core/approval-requests': {
    get: {
      tags: [TAG],
      summary: 'Listar solicitudes de doble aprobación',
      description: 'Lista paginada con filtros por `operationKey`, `status` y `entityType`. Requiere `APPROVALS` READ.',
      security: adminSecurity,
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } },
        { name: 'sortBy', in: 'query', schema: { type: 'string' } },
        { name: 'order', in: 'query', schema: { type: 'string', enum: ['ASC', 'DESC'] } },
        { name: 'operationKey', in: 'query', schema: { type: 'string', enum: OPERATION_KEYS } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: STATUS_VALUES } },
        { name: 'entityType', in: 'query', schema: { type: 'string' } }
      ],
      responses: {
        200: commonResponses.paginated(
          { $ref: '#/components/schemas/ApprovalRequestListItem' },
          'Solicitudes de aprobación obtenidas exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/core/approval-requests/policy': {
    get: {
      tags: [TAG],
      summary: 'Política de doble aprobación',
      description:
        'Devuelve qué operaciones están gateadas, sus roles aprobadores, condición (always/threshold) y umbral vigente. Requiere `APPROVALS` READ.',
      security: adminSecurity,
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/ApprovalPolicy' },
          'Política de doble aprobación obtenida exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/core/approval-requests/{id}': {
    get: {
      tags: [TAG],
      summary: 'Detalle de una solicitud de aprobación',
      description: 'Incluye el `payload` propuesto y el `result` si ya fue aprobada. Requiere `APPROVALS` READ.',
      security: adminSecurity,
      parameters: [idParam],
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/ApprovalRequest' },
          'Solicitud de aprobación obtenida exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/core/approval-requests/{id}/resolve': {
    post: {
      tags: [TAG],
      summary: 'Resolver (aprobar / rechazar) una solicitud de aprobación',
      description: `
Resolución del segundo funcionario (checker). Requiere \`APPROVALS\` UPDATE y, además, el service valida:

- **Rol aprobador** del registro de la operación (\`approverRoles\`) o un rol wildcard (SUPERADMIN, admin, ADMIN_PRODUCTOS).
- **Segregación de funciones:** el aprobador NO puede ser el mismo usuario que originó la operación (maker).
- La solicitud debe estar en estado \`pending\` (de lo contrario 409).

Al **aprobar** se invoca el handler registrado de la operación, que ejecuta la acción real
(ej. desactivar un recurso, cambiar un rol, activar una regla) y guarda el \`result\`.
Al **rechazar** se descarta la operación pendiente.

> Esta es la vía única de segunda aprobación para TODAS las operaciones gateadas.
      `.trim(),
      security: adminSecurity,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApprovalResolveRequest' },
            examples: {
              approve: { summary: 'Aprobar', value: { decision: 'approve', notes: 'Revisado y autorizado.' } },
              reject: { summary: 'Rechazar', value: { decision: 'reject', notes: 'No cumple con la política vigente.' } }
            }
          }
        }
      },
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/ApprovalRequest' }, 'Solicitud resuelta exitosamente'),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...resolveForbiddenResponse,
        ...commonResponses.NotFound,
        ...resolveConflictResponse,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  }
};

const tags = [{ name: TAG, description: 'Framework de doble aprobación (maker-checker): cola, política y resolución.' }];

export = { schemas, paths, tags };
