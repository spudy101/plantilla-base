// config/swagger/modules/admin/kyc/iam/admin-rbac.paths.js

const commonResponses = require('../../../../responses/common.responses');

/**
 * ============================================================
 * ADMIN RBAC PATHS — RF-ADM-01
 * ============================================================
 * Catálogo RBAC de solo lectura + gestión de permisos en runtime.
 *
 * Rutas montadas en: /admin/api/v1/kyc/iam/rbac
 *   GET    /admin/api/v1/kyc/iam/rbac/modules
 *   GET    /admin/api/v1/kyc/iam/rbac/roles
 *   GET    /admin/api/v1/kyc/iam/rbac/me
 *   GET    /admin/api/v1/kyc/iam/rbac/roles/:roleName/permissions
 *   POST   /admin/api/v1/kyc/iam/rbac/roles/:roleName/permissions
 *   DELETE /admin/api/v1/kyc/iam/rbac/roles/:roleName/permissions/:permissionId
 */

// ─── Schemas ──────────────────────────────────────────────────

const schemas = {
  RbacModuleGroup: {
    type: 'object',
    description: 'Agrupación de módulos para pintar el árbol de permisos en el front.',
    properties: {
      key: { type: 'string', example: 'clients', description: 'Identificador del grupo' },
      label: { type: 'string', example: 'Clientes', description: 'Etiqueta humana del grupo (ES)' },
      description: {
        type: 'string',
        example: 'Clientes finales y su información KYC.',
        description: 'Texto de una línea que explica para qué sirve el grupo (subtítulo/tooltip; solo presentación)'
      },
      modules: {
        type: 'array',
        description: 'Módulos granulares que cuelgan del grupo. En un grupo contenedor puro (ej. Administración) va vacío.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'employmentRecords', description: 'Id plano del módulo' },
            label: { type: 'string', example: 'Documentos Laborales', description: 'Etiqueta humana del módulo (ES)' },
            description: {
              type: 'string',
              example: 'Datos laborales del cliente.',
              description: 'Texto de una línea que explica para qué sirve el módulo (subtítulo/tooltip; solo presentación)'
            }
          }
        }
      },
      subgroups: {
        type: 'array',
        description:
          'Subgrupos anidados (mismo shape, recursivo). Presentación del menú: Integraciones → {Proveedores, Conexiones}; Administración → {Roles y Permisos, Usuarios Internos, Doble Aprobación}. Vacío si el grupo no anida nada. El anidamiento es SOLO visual — la resolución de permisos usa los `modules` planos.',
        items: { $ref: '#/components/schemas/RbacModuleGroup' }
      }
    }
  },

  RbacModuleCatalog: {
    type: 'object',
    description: 'Catálogo completo de módulos RBAC (agrupados y planos) y acciones disponibles.',
    properties: {
      groups: {
        type: 'array',
        items: { $ref: '#/components/schemas/RbacModuleGroup' },
        description: 'Árbol agrupado con labels en español. Es lo que el front usa para pintar el panel de permisos.'
      },
      modules: {
        type: 'array',
        items: { type: 'string', example: 'employmentRecords' },
        description: 'Lista plana de ids de módulo registrados en la matriz RBAC (compatibilidad).'
      },
      actions: {
        type: 'array',
        items: { type: 'string', example: 'READ' },
        description: 'Acciones posibles: READ, CREATE, UPDATE, DELETE'
      }
    }
  },

  RbacRoleMatrixEntry: {
    type: 'object',
    description: 'Entrada de la matriz de roles diferenciando permisos inmutables (base) de los agregados en runtime (added).',
    properties: {
      role: {
        type: 'string',
        example: 'ADMIN',
        description: 'Nombre del rol'
      },
      basePermissions: {
        type: 'object',
        description:
          'Permisos definidos en el código fuente (inmutables — solo cambian con un deploy). El front debe mostrarlos como no editables.',
        additionalProperties: {
          type: 'array',
          items: { type: 'string', example: 'READ' }
        },
        example: {
          clientsList: ['READ'],
          notificationManagement: ['READ', 'CREATE', 'UPDATE']
        }
      },
      addedPermissions: {
        type: 'object',
        description:
          'Permisos otorgados en runtime por el SUPERADMIN (overrides en BD). El front puede mostrarlos con opción de revocar.',
        additionalProperties: {
          type: 'array',
          items: { type: 'string', example: 'READ' }
        },
        example: {
          engineLogs: ['READ'],
          beneficiaryCompanies: ['CREATE']
        }
      }
    }
  },

  RbacEffectivePermissions: {
    type: 'object',
    description: 'Permisos efectivos del usuario autenticado (base + overrides).',
    properties: {
      role: {
        type: 'string',
        example: 'SUPERADMIN',
        description: 'Nombre del rol del usuario autenticado'
      },
      permissions: {
        type: 'object',
        description: 'Mapa de módulo → array de acciones permitidas (incluye overrides activos).',
        additionalProperties: {
          type: 'array',
          items: { type: 'string', example: 'READ' }
        },
        example: {
          rolesPermissions: ['READ', 'CREATE', 'UPDATE', 'DELETE'],
          notificationManagement: ['READ', 'CREATE', 'UPDATE']
        }
      }
    }
  },

  RolePermissionOverride: {
    type: 'object',
    description: 'Permiso adicional otorgado en runtime a un rol.',
    properties: {
      rolePermissionId: { type: 'string', format: 'uuid' },
      roleName: { type: 'string', example: 'ADMIN' },
      moduleName: { type: 'string', example: 'engineLogs' },
      action: { type: 'string', enum: ['READ', 'CREATE', 'UPDATE', 'DELETE'], example: 'READ' },
      grantedByUserId: {
        type: 'string',
        format: 'uuid',
        description: 'UUID del admin que otorgó el permiso.'
      },
      grantedBy: {
        type: 'object',
        nullable: true,
        description: 'Información del admin que otorgó el permiso.',
        properties: {
          userId: { type: 'string', format: 'uuid' },
          username: { type: 'string', example: 'superadmin' },
          fullName: { type: 'string', nullable: true, example: 'Carlos López' }
        }
      },
      createdAt: { type: 'string', format: 'date-time' }
    }
  },

  RolePermissionsListResult: {
    type: 'object',
    properties: {
      role: { type: 'string', example: 'ADMIN' },
      overrides: {
        type: 'array',
        items: { $ref: '#/components/schemas/RolePermissionOverride' },
        description: 'Permisos adicionales otorgados en runtime para este rol'
      }
    }
  }
};

// ─── Parámetros comunes ────────────────────────────────────────

const adminSecurity = [{ bearerAuth: [], idTokenAuth: [] }];

const roleNameParam = {
  name: 'roleName',
  in: 'path',
  required: true,
  schema: { type: 'string', example: 'ADMIN' },
  description: 'Nombre del rol RBAC (ej: SUPERADMIN, ADMIN, ADMIN_PRODUCTOS)'
};

const permissionIdParam = {
  name: 'permissionId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
  description: 'UUID del override de permiso a revocar'
};

// ─── Paths ────────────────────────────────────────────────────

const paths = {
  '/admin/api/v1/kyc/iam/rbac/modules': {
    get: {
      tags: ['Admin - RBAC'],
      summary: 'Catálogo de módulos y acciones RBAC',
      operationId: 'adminGetRbacCatalog',
      description: `Devuelve el catálogo completo de módulos RBAC y sus acciones disponibles (READ, CREATE, UPDATE, DELETE).

Requiere permiso **READ** sobre el módulo \`rolesPermissions\`.`,
      security: adminSecurity,
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/RbacModuleCatalog' }, 'Catálogo RBAC obtenido exitosamente'),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/kyc/iam/rbac/roles': {
    get: {
      tags: ['Admin - RBAC'],
      summary: 'Matriz de roles con permisos efectivos',
      operationId: 'adminGetRoleMatrix',
      description: `Devuelve todos los roles internos con sus permisos separados por origen:

- **base_permissions** — definidos en el código fuente (inmutables, solo cambian con deploy). El front los muestra sin opción de editar.
- **added_permissions** — otorgados en runtime por el SUPERADMIN vía overrides en BD. El front los muestra con opción de revocar.

Requiere permiso **READ** sobre el módulo \`rolesPermissions\`.`,
      security: adminSecurity,
      responses: {
        200: commonResponses.ok(
          {
            type: 'array',
            items: { $ref: '#/components/schemas/RbacRoleMatrixEntry' }
          },
          'Matriz de roles obtenida exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/kyc/iam/rbac/me': {
    get: {
      tags: ['Admin - RBAC'],
      summary: 'Permisos efectivos del usuario autenticado',
      operationId: 'adminGetMyPermissions',
      description:
        'Devuelve los permisos efectivos del usuario autenticado (permisos base + overrides activos en Redis/BD). Accesible por cualquier usuario autenticado del servidor admin.',
      security: adminSecurity,
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/RbacEffectivePermissions' },
          'Permisos del usuario obtenidos exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/kyc/iam/rbac/roles/{roleName}/permissions': {
    get: {
      tags: ['Admin - RBAC'],
      summary: 'Listar overrides de un rol',
      operationId: 'adminListRolePermissionOverrides',
      description: `Lista todos los permisos adicionales (overrides) otorgados en runtime al rol indicado.

Los overrides complementan la matriz base definida en código. Requiere permiso **READ** sobre el módulo \`rolesPermissions\`.`,
      security: adminSecurity,
      parameters: [roleNameParam],
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/RolePermissionsListResult' },
          'Overrides del rol obtenidos exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    },

    post: {
      tags: ['Admin - RBAC'],
      summary: 'Otorgar permiso adicional a un rol',
      operationId: 'adminGrantRolePermission',
      description: `Otorga un permiso adicional (override) a un rol para un módulo y acción específicos.

- Solo el **SUPERADMIN** puede hacer esta operación (requiere permiso **CREATE** sobre \`rolesPermissions\`).
- Si el permiso ya existe, devuelve **409 Conflict**.
- Al otorgar, el caché Redis del rol se invalida inmediatamente.
- La acción queda registrada en \`logAudit\` con \`RBAC_PERMISSION_GRANTED\`.`,
      security: adminSecurity,
      parameters: [roleNameParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['moduleName', 'action'],
              properties: {
                moduleName: {
                  type: 'string',
                  example: 'engineLogs',
                  description: 'Nombre del módulo RBAC (debe existir en el catálogo)'
                },
                action: {
                  type: 'string',
                  enum: ['READ', 'CREATE', 'UPDATE', 'DELETE'],
                  example: 'READ'
                }
              }
            }
          }
        }
      },
      responses: {
        201: commonResponses.created({ $ref: '#/components/schemas/RolePermissionOverride' }, 'Permiso otorgado exitosamente'),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.Conflict,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/kyc/iam/rbac/roles/{roleName}/permissions/{permissionId}': {
    delete: {
      tags: ['Admin - RBAC'],
      summary: 'Revocar override de permiso de un rol',
      operationId: 'adminRevokeRolePermission',
      description: `Elimina un override de permiso previamente otorgado.

- Solo el **SUPERADMIN** puede hacer esta operación (requiere permiso **DELETE** sobre \`rolesPermissions\`).
- Al revocar, el caché Redis del rol se invalida inmediatamente.
- La acción queda registrada en \`logAudit\` con \`RBAC_PERMISSION_REVOKED\`.`,
      security: adminSecurity,
      parameters: [roleNameParam, permissionIdParam],
      responses: {
        200: commonResponses.ok(
          {
            type: 'object',
            properties: {
              permissionId: { type: 'string', format: 'uuid' },
              deleted: { type: 'boolean', example: true }
            }
          },
          'Permiso revocado exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  }
};

module.exports = { paths, schemas };
