import commonResponses from '../../../config/swagger/responses/common.responses';

/**
 * ============================================================
 * SYSTEM GLOBAL CONFIG PATHS — ADMIN
 * ============================================================
 * Módulo: /admin/api/v1/core/system-config
 * Roles: GET → SUPERADMIN y AUDITOR_INTERNO; PATCH → solo SUPERADMIN
 *
 * Rutas:
 *   GET   /admin/api/v1/core/system-config
 *   PATCH /admin/api/v1/core/system-config
 */

const schemas = {
  // ─── JSONB anidado (keys camelCase en la respuesta; se persisten snake_case) ───
  IntegrationResilience: {
    type: 'object',
    description:
      'Resiliencia homologada de TODAS las integraciones salientes. Un solo valor para todas ' +
      '(sin overrides por proveedor). La consumen el circuit breaker y todos los clientes (timeout + reintentos + umbrales).',
    properties: {
      timeoutMs: {
        type: 'integer',
        example: 30000,
        description: 'Timeout normal de cada llamada saliente (ms). Rango: 1000-120000.'
      },
      manualReviewTimeoutMs: {
        type: 'integer',
        example: 10000,
        description: 'Timeout fast-fail para operaciones síncronas de revisión/validación manual (ms). Rango: 1000-120000.'
      },
      maxRetries: { type: 'integer', example: 3, description: 'Reintentos de withRetry. Rango: 0-10.' },
      circuitBreaker: {
        type: 'object',
        properties: {
          failureThreshold: { type: 'integer', example: 5, description: 'Fallos para abrir el breaker. Rango: 1-100.' },
          recoveryTimeMs: {
            type: 'integer',
            example: 60000,
            description: 'Tiempo antes de intentar recuperar tras abrir (ms). Rango: 1000-600000.'
          },
          failuresTtlS: {
            type: 'integer',
            example: 300,
            description: 'TTL de la ventana de conteo de fallos (s). Rango: 10-3600.'
          }
        }
      }
    }
  },

  SystemGlobalConfig: {
    type: 'object',
    description:
      'Configuración global del sistema. Registro único activo (`is_active: true`). `config_version` se incrementa en cada actualización.',
    properties: {
      configId: { type: 'string', format: 'uuid', readOnly: true },
      configVersion: {
        type: 'integer',
        readOnly: true,
        example: 3,
        description: 'Versión del registro. Se auto-incrementa en cada PATCH.'
      },
      currency: { type: 'string', example: 'CLP', description: 'Código de moneda (ISO 4217).' },
      auditRetentionHotYears: {
        type: 'integer',
        example: 5,
        description: 'Años de retención en BD (caliente). **Afecta directamente el worker de purga.** Mínimo: 1.'
      },
      auditRetentionColdYears: {
        type: 'integer',
        example: 10,
        description:
          'Años de retención en S3 Glacier (frío). **Informacional** — el lifecycle de S3 es declarativo en la infraestructura. Mínimo: 1.'
      },
      auditHotPurgeEnabled: {
        type: 'boolean',
        example: false,
        description:
          'Interruptor de la purga del caliente. Cuando es `true`, el worker `audit-archive` ' +
          'borra de la BD los `audit_logs` que superaron `auditRetentionHotYears` (la copia permanece en S3/frío). ' +
          'Default `false` — operación destructiva que enciende el Superadministrador.'
      },
      integrationResilience: { $ref: '#/components/schemas/IntegrationResilience' }
    }
  },

  SystemGlobalConfigPatch: {
    type: 'object',
    description: 'Body del PATCH. Todos los campos son opcionales — se actualiza solo lo que se envíe.',
    properties: {
      currency: { type: 'string', maxLength: 10, example: 'CLP' },
      auditRetentionHotYears: { type: 'integer', minimum: 1, example: 7 },
      auditRetentionColdYears: { type: 'integer', minimum: 1, example: 10 },
      auditHotPurgeEnabled: { type: 'boolean', example: false },
      integrationResilience: {
        type: 'object',
        description:
          'Resiliencia homologada de integraciones. Merge parcial: cada campo es opcional; ' +
          'lo que no se envía conserva su valor actual (incluido el sub-objeto `circuitBreaker`, campo a campo).',
        properties: {
          timeoutMs: { type: 'integer', minimum: 1000, maximum: 120000, example: 30000 },
          manualReviewTimeoutMs: { type: 'integer', minimum: 1000, maximum: 120000, example: 10000 },
          maxRetries: { type: 'integer', minimum: 0, maximum: 10, example: 3 },
          circuitBreaker: {
            type: 'object',
            properties: {
              failureThreshold: { type: 'integer', minimum: 1, maximum: 100, example: 5 },
              recoveryTimeMs: { type: 'integer', minimum: 1000, maximum: 600000, example: 60000 },
              failuresTtlS: { type: 'integer', minimum: 10, maximum: 3600, example: 300 }
            }
          }
        }
      }
    }
  }
};

const paths = {
  '/admin/api/v1/core/system-config': {
    get: {
      tags: ['Admin - Configuración Global'],
      summary: 'Obtener configuración global del sistema',
      operationId: 'adminGetSystemConfig',
      description: `Devuelve el registro activo de configuración global del sistema.

**Acceso:** SUPERADMIN y AUDITOR_INTERNO (solo lectura).`,
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/SystemGlobalConfig' },
          'Configuración global obtenida exitosamente.'
        ),
        404: { description: 'No existe configuración global activa. Contactar al equipo de infraestructura.' },
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    },

    patch: {
      tags: ['Admin - Configuración Global'],
      summary: 'Actualizar configuración global del sistema',
      operationId: 'adminUpdateSystemConfig',
      description: `Actualiza parcialmente la configuración global. Solo se modifican los campos enviados.

**Acceso:** Solo SUPERADMIN.

**Comportamiento especial:**
- \`configVersion\` se auto-incrementa en cada PATCH exitoso.
- \`auditRetentionHotYears\` define la ventana del caliente; el worker de purga de \`audit_logs\` la usa como corte.
- \`auditHotPurgeEnabled\` enciende/apaga esa purga (default \`false\`, destructiva). Con \`true\` el worker mensual borra de la BD los logs vencidos (la copia permanece en S3/frío).
- \`auditRetentionColdYears\` es informacional — el lifecycle de S3 es declarativo en la infraestructura.
- Esta acción genera una **alerta de auditoría** automática en el panel del Superadmin (\`SYSTEM_GLOBAL_CONFIG_UPDATED\`).`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SystemGlobalConfigPatch' },
            example: {
              currency: 'CLP',
              auditRetentionHotYears: 7,
              auditRetentionColdYears: 10,
              auditHotPurgeEnabled: false,
              integrationResilience: {
                timeoutMs: 30000,
                manualReviewTimeoutMs: 10000,
                maxRetries: 3,
                circuitBreaker: { failureThreshold: 5, recoveryTimeMs: 60000, failuresTtlS: 300 }
              }
            }
          }
        }
      },
      responses: {
        200: commonResponses.ok(
          {
            allOf: [{ $ref: '#/components/schemas/SystemGlobalConfig' }],
            example: {
              configId: '7b1f2c3d-4e5a-6b7c-8d9e-0f1a2b3c4d5e',
              configVersion: 4,
              currency: 'CLP',
              auditRetentionHotYears: 7,
              auditRetentionColdYears: 10,
              auditHotPurgeEnabled: false,
              integrationResilience: {
                timeoutMs: 30000,
                manualReviewTimeoutMs: 10000,
                maxRetries: 3,
                circuitBreaker: { failureThreshold: 5, recoveryTimeMs: 60000, failuresTtlS: 300 }
              }
            }
          },
          'Configuración global actualizada exitosamente.'
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
