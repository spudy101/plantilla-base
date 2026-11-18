import commonResponses from '../../../../responses/common.responses';

/**
 * ============================================================
 * AUDIT ALERT PATHS — ADMIN  (RF-ADM-03)
 * ============================================================
 * Módulo: /admin/api/v1/records/audit/audit-alerts
 * Roles: GET → SUPERADMIN y AUDITOR_INTERNO (solo lectura); PATCH y POST → solo SUPERADMIN
 *
 * Rutas:
 *   GET   /admin/api/v1/records/audit/audit-alerts
 *   PATCH /admin/api/v1/records/audit/audit-alerts/:alertId/acknowledge
 *   POST  /admin/api/v1/records/audit/audit-alerts/acknowledge-bulk
 */

const schemas = {
  AuditAlert: {
    type: 'object',
    description: `Alerta de auditoría generada automáticamente cuando se registra una acción crítica en:
- Roles / RBAC (permisos otorgados o revocados, rol de usuario modificado)
- Motor de Reglas / Productos (conjuntos de reglas y políticas creados, activados o eliminados)
- Entidades (creadas, actualizadas, estado modificado)
- Parámetros del sistema (SystemGlobalConfig actualizado)
- **Integridad de expedientes de vinculación** (RF-USR-05): acción \`BINDING_INTEGRITY_VIOLATION_DETECTED\` — el hash HMAC-SHA256 del expediente sellado no coincide con el contenido almacenado, indicando una posible manipulación posterior al sellado. Riesgo: \`critical\`.`,
    properties: {
      alertId: { type: 'string', format: 'uuid' },
      auditLogId: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description: 'Referencia al audit_log que originó la alerta.'
      },
      action: {
        type: 'string',
        example: 'RBAC_PERMISSION_GRANTED',
        description:
          'Acción que generó la alerta. Ejemplos: `RBAC_PERMISSION_GRANTED`, `SYSTEM_GLOBAL_CONFIG_UPDATED`, `DUAL_APPROVAL_REQUESTED`.'
      },
      category: {
        type: 'string',
        nullable: true,
        example: 'RBAC',
        description: 'Categoría de la acción. Ej: RBAC, Vinculación, Motor de Reglas.'
      },
      risk: { type: 'string', enum: ['low', 'medium', 'high', 'critical', 'unknown'] },
      userId: { type: 'string', format: 'uuid', nullable: true, description: 'Usuario que realizó la acción.' },
      user: {
        type: 'object',
        nullable: true,
        description: 'Información del usuario que realizó la acción.',
        properties: {
          userId: { type: 'string', format: 'uuid' },
          username: { type: 'string', example: 'jdoe' },
          fullName: { type: 'string', nullable: true, example: 'John Doe' }
        }
      },
      entityId: { type: 'string', nullable: true, description: 'ID de la entidad afectada.' },
      entityType: { type: 'string', nullable: true, example: 'ApprovalRequest', description: 'Tipo de entidad afectada.' },
      message: { type: 'string', nullable: true, description: 'Descripción legible de la alerta.' },
      acknowledged: { type: 'boolean', default: false, description: 'Si el Superadmin ya reconoció la alerta.' },
      acknowledgedBy: { type: 'string', format: 'uuid', nullable: true, description: 'UUID del admin que reconoció la alerta.' },
      acknowledgedByUser: {
        type: 'object',
        nullable: true,
        description: 'Información del admin que reconoció la alerta. Null si aún no fue reconocida.',
        properties: {
          userId: { type: 'string', format: 'uuid' },
          username: { type: 'string', example: 'admin01' },
          fullName: { type: 'string', nullable: true, example: 'María García' }
        }
      },
      acknowledgedAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' }
    }
  }
};

const paginationParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
  { name: 'sortBy', in: 'query', schema: { type: 'string', default: 'createdAt' } },
  { name: 'order', in: 'query', schema: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC' } }
];

const alertIdParam = {
  name: 'alertId',
  in: 'path',
  required: true,
  description: 'UUID de la alerta de auditoría.',
  schema: { type: 'string', format: 'uuid' }
};

const paths = {
  '/admin/api/v1/records/audit/audit-alerts': {
    get: {
      tags: ['Admin - Auditoría / Alertas'],
      summary: 'Listar alertas de auditoría',
      operationId: 'adminListAuditAlerts',
      description: `Lista paginada de alertas de auditoría visibles en el panel del Superadmin.

**Acceso:** SUPERADMIN y AUDITOR_INTERNO (solo lectura). Las acciones de reconocimiento (acknowledge) son exclusivas del SUPERADMIN.

El campo \`metadata.pendingCount\` indica el total de alertas pendientes sin reconocer — útil para mostrar un badge en el panel.`,
      parameters: [
        ...paginationParams,
        {
          name: 'acknowledged',
          in: 'query',
          schema: { type: 'boolean' },
          description: 'Filtrar por estado de reconocimiento. Omitir para ver todas.'
        },
        { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Desde esta fecha.' },
        { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Hasta esta fecha.' },
        { name: 'action', in: 'query', schema: { type: 'string' }, description: 'Filtrar por código de acción.' },
        { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Filtrar por categoría.' }
      ],
      responses: {
        200: {
          description: 'Alertas obtenidas exitosamente.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Alertas de auditoría obtenidas exitosamente' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/AuditAlert' } },
                  metadata: {
                    allOf: [
                      { $ref: '#/components/schemas/Metadata' },
                      {
                        type: 'object',
                        properties: {
                          pendingCount: {
                            type: 'integer',
                            example: 5,
                            description: 'Total de alertas pendientes sin reconocer en el sistema.'
                          }
                        }
                      }
                    ]
                  }
                }
              }
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

  '/admin/api/v1/records/audit/audit-alerts/{alertId}/acknowledge': {
    patch: {
      tags: ['Admin - Auditoría / Alertas'],
      summary: 'Reconocer una alerta',
      operationId: 'adminAcknowledgeAlert',
      description: `Marca una alerta como reconocida por el Superadmin autenticado.

Una alerta reconocida deja de aparecer en el contador de pendientes del panel.
El registro de quién y cuándo reconoció queda guardado en \`acknowledgedBy\` y \`acknowledgedAt\`.`,
      parameters: [alertIdParam],
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/AuditAlert' }, 'Alerta reconocida exitosamente.'),
        ...commonResponses.NotFound,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/records/audit/audit-alerts/acknowledge-bulk': {
    post: {
      tags: ['Admin - Auditoría / Alertas'],
      summary: 'Reconocer múltiples alertas (bulk)',
      operationId: 'adminAcknowledgeAlertsBulk',
      description: `Reconoce un lote de alertas en una sola operación.

Útil para limpiar el panel cuando hay muchas alertas pendientes.
Solo afecta a alertas que aún no han sido reconocidas — las ya reconocidas son ignoradas sin error.

Devuelve \`acknowledged\` (cuántas se marcaron) y \`requested\` (cuántas se enviaron).`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['alertIds'],
              properties: {
                alertIds: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 100,
                  items: { type: 'string', format: 'uuid' },
                  example: ['uuid-1', 'uuid-2', 'uuid-3'],
                  description: 'Lista de IDs de alertas a reconocer (máximo 100 por llamada).'
                }
              }
            }
          }
        }
      },
      responses: {
        200: commonResponses.ok(
          {
            type: 'object',
            properties: {
              acknowledged: { type: 'integer', example: 3, description: 'Alertas marcadas como reconocidas.' },
              requested: { type: 'integer', example: 3, description: 'Total de alertas en la solicitud.' }
            }
          },
          '3 alertas reconocidas exitosamente.'
        ),
        ...commonResponses.ValidationError,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  }
};

export default { paths, schemas };
