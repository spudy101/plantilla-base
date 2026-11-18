// config/swagger/modules/admin/kyc/iam/admin-user.paths.ts

import commonResponses from '../../../config/swagger/responses/common.responses';
import piiMaskingDocModule from '../../../shared/validation/pii-masking.doc';
const { MASKED_EMAIL_DESC } = piiMaskingDocModule;

/**
 * ============================================================
 * ADMIN USER PATHS — RF-ADM-01
 * ============================================================
 * Gestión de usuarios internos (empleados de Base Project).
 *
 * Schemas globales reutilizados (definidos en kyc.schema.js):
 *   Role, Person, PersonContact, UserChangeLog, UserSession
 *
 * Schemas locales (propios de este módulo):
 *   InternalUserPerson   → Person + contact (PersonContact)
 *   InternalUser         → composición de User fields + role + person
 *   InternalUserListItem → proyección liviana para listados
 *   InternalUserCreated  → InternalUser + temporaryPassword
 *
 * Rutas montadas en: /admin/api/v1/kyc/iam/users
 *   GET    /admin/api/v1/kyc/iam/users
 *   POST   /admin/api/v1/kyc/iam/users
 *   GET    /admin/api/v1/kyc/iam/users/deleted
 *   GET    /admin/api/v1/kyc/iam/users/:userId
 *   PATCH  /admin/api/v1/kyc/iam/users/:userId
 *   PATCH  /admin/api/v1/kyc/iam/users/:userId/role
 *   PATCH  /admin/api/v1/kyc/iam/users/:userId/status
 *   DELETE /admin/api/v1/kyc/iam/users/:userId/delete-account
 *   GET    /admin/api/v1/kyc/iam/users/:userId/sessions
 *   DELETE /admin/api/v1/kyc/iam/users/:userId/sessions
 *   GET    /admin/api/v1/kyc/iam/users/:userId/change-logs
 */

// ─── Schemas locales ──────────────────────────────────────────
// Solo se definen aquí los que NO existen en los schemas globales.
// Los schemas globales (Role, PersonContact, Person, UserChangeLog,
// UserSession) se referencian con $ref directamente en los paths.

const schemas = {
  // Person con contact incluido — UsersComponent devuelve PersonComponent
  // con { includeContact: true }, que añade la asociación contact al objeto.
  InternalUserPerson: {
    allOf: [
      { $ref: '#/components/schemas/Person' },
      {
        type: 'object',
        properties: {
          contact: { $ref: '#/components/schemas/PersonContact' }
        }
      }
    ]
  },

  // Detalle completo del usuario interno
  InternalUser: {
    type: 'object',
    properties: {
      userId: { type: 'string', format: 'uuid' },
      username: { type: 'string', example: 'juan.perez' },
      isActive: { type: 'boolean' },
      deletedAt: {
        type: 'string',
        format: 'date-time',
        nullable: true,
        description: 'Fecha de eliminación (ofuscación irreversible). `null` = cuenta no eliminada e intocable cuando != null.'
      },
      totpEnabled: { type: 'boolean' },
      smsMfaEnabled: { type: 'boolean' },
      preferredMfaMethod: { type: 'string', example: 'totp', nullable: true },
      role: { allOf: [{ $ref: '#/components/schemas/Role' }], nullable: true },
      person: { $ref: '#/components/schemas/InternalUserPerson' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' }
    }
  },

  // Proyección liviana para listados
  InternalUserListItem: {
    type: 'object',
    properties: {
      userId: { type: 'string', format: 'uuid' },
      username: { type: 'string' },
      isActive: { type: 'boolean' },
      deletedAt: {
        type: 'string',
        format: 'date-time',
        nullable: true,
        description: 'Fecha de eliminación (ofuscación irreversible). `null` si la cuenta no está eliminada.'
      },
      roleName: { type: 'string', nullable: true, example: 'ADMIN' },
      firstName: { type: 'string', nullable: true },
      lastName: { type: 'string', nullable: true },
      email: { type: 'string', nullable: true, example: '****z@base-project.com', description: MASKED_EMAIL_DESC },
      pendingApproval: { $ref: '#/components/schemas/PendingApproval' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' }
    }
  },

  // Respuesta de creación — extiende InternalUser con la contraseña temporal
  InternalUserCreated: {
    allOf: [
      { $ref: '#/components/schemas/InternalUser' },
      {
        type: 'object',
        properties: {
          temporaryPassword: {
            type: 'string',
            description: 'Contraseña temporal generada al crear el usuario. Solo se devuelve en esta respuesta.',
            example: 'Tmp#aB9!xZ2k'
          }
        }
      }
    ]
  }
};

// ─── Parámetros comunes ────────────────────────────────────────

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

const userIdParam = {
  name: 'userId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
  description: 'UUID del usuario interno'
};

const adminSecurity = [{ bearerAuth: [], idTokenAuth: [] }];

// ─── Paths ────────────────────────────────────────────────────

const paths = {
  '/admin/api/v1/kyc/iam/users': {
    get: {
      tags: ['Admin - Usuarios Internos'],
      summary: 'Listar usuarios internos',
      operationId: 'adminListInternalUsers',
      description: `Lista paginada de usuarios internos (empleados de Base Project).

Filtra automáticamente por roles internos (\`ADMIN_*\`, \`PENDIENTE_ASIGNACION\`, etc.). Soporta búsqueda por nombre o email y filtro por roleId o estado.

**Exclusiones automáticas del listado:**
- El **propio solicitante** no aparece en su listado (un admin no se ve a sí mismo).
- Los usuarios con rol **superadministrador** (\`SUPERADMIN\`) **nunca** se listan, ni siquiera filtrando por su \`roleId\`.`,
      security: adminSecurity,
      parameters: [
        ...paginationParams,
        {
          name: 'search',
          in: 'query',
          schema: { type: 'string' },
          description: 'Búsqueda por nombre o email'
        },
        {
          name: 'roleId',
          in: 'query',
          schema: { type: 'string', format: 'uuid' },
          description: 'Filtrar por rol específico (debe ser rol interno)'
        },
        {
          name: 'isActive',
          in: 'query',
          schema: { type: 'boolean' },
          description: 'Filtrar por estado activo/inactivo'
        }
      ],
      responses: {
        200: commonResponses.paginated(
          { $ref: '#/components/schemas/InternalUserListItem' },
          'Lista de usuarios internos obtenida exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    },

    post: {
      tags: ['Admin - Usuarios Internos'],
      summary: 'Crear usuario interno',
      operationId: 'adminCreateInternalUser',
      description: `Crea un nuevo usuario interno. El usuario nace con rol **\`PENDIENTE_ASIGNACION\`** (cero permisos), en cumplimiento del principio de mínimo privilegio (RF-ADM-01 criterio 5).

El administrador debe asignar el rol real posteriormente con \`PATCH /:userId/role\`.

La contraseña temporal generada **solo se devuelve en esta respuesta** — no se puede recuperar después.`,
      security: adminSecurity,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'firstName', 'lastName', 'nationalId'],
              properties: {
                email: { type: 'string', format: 'email', example: 'juan.perez@base-project.com' },
                firstName: { type: 'string', example: 'Juan' },
                middleName: { type: 'string', nullable: true, example: 'Carlos' },
                lastName: { type: 'string', example: 'Pérez' },
                secondLastName: { type: 'string', nullable: true, example: 'Gómez' },
                nationalId: { type: 'string', example: '12345678' }
              }
            }
          }
        }
      },
      responses: {
        201: commonResponses.created(
          { $ref: '#/components/schemas/InternalUserCreated' },
          'Usuario interno creado exitosamente. Incluye contraseña temporal.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.Conflict,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/kyc/iam/users/roles': {
    get: {
      tags: ['Admin - Usuarios Internos'],
      summary: 'Catálogo de roles internos (para filtro del listado)',
      operationId: 'adminListInternalRoleOptions',
      description: `Devuelve los roles **internos** disponibles para poblar el filtro por rol del listado de
usuarios internos. Excluye roles de cliente y roles de **superadministrador** — son los mismos roles que
acepta el filtro \`roleId\` de \`GET /users\`. Pensado para el dropdown del front, no es la matriz RBAC completa.`,
      security: adminSecurity,
      responses: {
        200: commonResponses.ok(
          {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                roleId: { type: 'string', format: 'uuid' },
                name: { type: 'string', example: 'ANALYST' },
                description: { type: 'string', nullable: true }
              }
            }
          },
          'Roles internos obtenidos exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/kyc/iam/users/deleted': {
    get: {
      tags: ['Admin - Usuarios Internos'],
      summary: 'Listar usuarios internos eliminados (histórico)',
      operationId: 'adminListDeletedInternalUsers',
      description: `Lista paginada **read-only** de usuarios internos **eliminados** (\`deletedAt != null\`).

Estas cuentas fueron ofuscadas de forma irreversible y son **intocables**: no se pueden editar, reactivar, cambiar de rol ni re-eliminar (toda operación de escritura responde **409**).

El listado normal (\`GET /users\`) **excluye** estas cuentas; este endpoint es exclusivamente para consulta histórica.`,
      security: adminSecurity,
      parameters: [
        ...paginationParams,
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Búsqueda (limitada: los datos están ofuscados)' },
        {
          name: 'roleId',
          in: 'query',
          schema: { type: 'string', format: 'uuid' },
          description: 'Filtrar por rol específico (debe ser rol interno)'
        }
      ],
      responses: {
        200: commonResponses.paginated(
          { $ref: '#/components/schemas/InternalUserListItem' },
          'Lista de usuarios internos eliminados obtenida exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/kyc/iam/users/{userId}': {
    get: {
      tags: ['Admin - Usuarios Internos'],
      summary: 'Detalle de usuario interno',
      operationId: 'adminGetInternalUser',
      security: adminSecurity,
      parameters: [userIdParam],
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/InternalUser' }, 'Usuario interno obtenido exitosamente'),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.InternalServerError
      }
    },

    patch: {
      tags: ['Admin - Usuarios Internos'],
      summary: 'Actualizar datos básicos del usuario interno',
      operationId: 'adminUpdateInternalUser',
      description: 'Actualiza nombre y/o apellidos. Para cambiar rol o estado usar los endpoints específicos.',
      security: adminSecurity,
      parameters: [userIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              minProperties: 1,
              properties: {
                firstName: { type: 'string', example: 'Juan' },
                middleName: { type: 'string', nullable: true },
                lastName: { type: 'string', example: 'Pérez' },
                secondLastName: { type: 'string', nullable: true }
              }
            }
          }
        }
      },
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/InternalUser' }, 'Usuario interno actualizado exitosamente'),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/kyc/iam/users/{userId}/role': {
    patch: {
      tags: ['Admin - Usuarios Internos'],
      summary: 'Asignar / cambiar rol de usuario interno',
      operationId: 'adminChangeInternalUserRole',
      description: `Asigna un nuevo rol al usuario. El cambio queda en bitácora de auditoría con actor, usuario afectado, rol anterior, rol nuevo y timestamp.

Al cambiar el rol, **todas las sesiones activas se invalidan** para que el nuevo rol surta efecto de inmediato.

Solo se pueden asignar roles internos. No se puede asignar un rol de cliente.

El rol de un **superadministrador** (\`SUPERADMIN\`) no se puede cambiar: la operación responde **403 Forbidden**.

> **Doble aprobación (maker-checker):** el cambio queda **pendiente de una segunda aprobación** → responde
> **202** con el \`ApprovalRequest\` y el rol NO cambia hasta que un segundo aprobador (SUPERADMIN) lo
> resuelve vía \`POST /api/approval-requests/{id}/resolve\`.
> Con el flag apagado, o cuando el actor es \`SUPERADMIN\` (auto-aprobación auditada), se ejecuta directo (**200**).`,
      security: adminSecurity,
      parameters: [userIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['roleId'],
              properties: {
                roleId: {
                  type: 'string',
                  format: 'uuid',
                  description: 'UUID del nuevo rol interno'
                }
              }
            }
          }
        }
      },
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/InternalUser' },
          'Rol actualizado exitosamente (ejecución directa: flag apagado o actor SUPERADMIN)'
        ),
        202: commonResponses.accepted(
          { $ref: '#/components/schemas/ApprovalRequest' },
          'Cambio de rol pendiente de segunda aprobación (doble aprobación global). El rol NO cambia hasta que se resuelva.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/kyc/iam/users/{userId}/status': {
    patch: {
      tags: ['Admin - Usuarios Internos'],
      summary: 'Activar o desactivar usuario interno',
      operationId: 'adminChangeInternalUserStatus',
      description: `Activa o desactiva la cuenta del usuario. El cambio queda en bitácora de auditoría.

Al **desactivar**, todas las sesiones activas se cierran inmediatamente.

Un **superadministrador** (\`SUPERADMIN\`) no se puede desactivar: el intento responde **403 Forbidden**.`,
      security: adminSecurity,
      parameters: [userIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['isActive'],
              properties: {
                isActive: { type: 'boolean', description: '`true` activa, `false` desactiva' }
              }
            }
          }
        }
      },
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/InternalUser' },
          'Estado del usuario interno actualizado exitosamente'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/kyc/iam/users/{userId}/delete-account': {
    delete: {
      tags: ['Admin - Usuarios Internos'],
      summary: 'Eliminar usuario interno (ofuscación irreversible)',
      operationId: 'adminDeleteInternalUser',
      description: `Elimina un usuario interno: **ofusca** sus datos personales de forma irreversible (Ley 1581/2012), lo desactiva, sella \`deletedAt\` y cierra sus sesiones.

Tras la eliminación la cuenta queda **intocable** y solo visible en \`GET /users/deleted\`.

El administrador debe confirmar su **propia contraseña** (\`currentPassword\`) como re-autenticación.

Un **superadministrador** (\`SUPERADMIN\`) no se puede eliminar (**403**). Una cuenta ya eliminada no se puede re-eliminar (**409**).

> **Doble aprobación (maker-checker):** la eliminación queda **pendiente de una segunda aprobación**.
> El endpoint responde **202** con el \`ApprovalRequest\`; la cuenta NO se elimina hasta que un segundo
> aprobador (SUPERADMIN) lo resuelve.`,
      security: adminSecurity,
      parameters: [userIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['currentPassword'],
              properties: {
                currentPassword: {
                  type: 'string',
                  format: 'password',
                  description: 'Contraseña actual del administrador (re-autenticación)'
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
              userId: { type: 'string', format: 'uuid' },
              deleted: { type: 'boolean', example: true }
            }
          },
          'Usuario interno eliminado exitosamente'
        ),
        202: commonResponses.accepted(
          { $ref: '#/components/schemas/ApprovalRequest' },
          'Eliminación pendiente de segunda aprobación (doble aprobación global). La cuenta NO se elimina hasta que se resuelva.'
        ),
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

  '/admin/api/v1/kyc/iam/users/{userId}/sessions': {
    get: {
      tags: ['Admin - Usuarios Internos'],
      summary: 'Listar sesiones activas del usuario interno',
      operationId: 'adminListInternalUserSessions',
      security: adminSecurity,
      parameters: [userIdParam],
      responses: {
        200: commonResponses.ok(
          {
            type: 'array',
            items: { $ref: '#/components/schemas/UserSession' }
          },
          'Sesiones del usuario interno obtenidas exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.InternalServerError
      }
    },

    delete: {
      tags: ['Admin - Usuarios Internos'],
      summary: 'Cerrar todas las sesiones del usuario interno',
      operationId: 'adminCloseInternalUserSessions',
      description: 'Cierra todas las sesiones activas en BD e invalida los tokens en Redis.',
      security: adminSecurity,
      parameters: [userIdParam],
      responses: {
        200: commonResponses.ok(
          {
            type: 'object',
            properties: {
              userId: { type: 'string', format: 'uuid' },
              closed: { type: 'boolean', example: true }
            }
          },
          'Sesiones cerradas exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/kyc/iam/users/{userId}/change-logs': {
    get: {
      tags: ['Admin - Usuarios Internos'],
      summary: 'Bitácora de cambios del usuario interno',
      operationId: 'adminListInternalUserChangeLogs',
      description: 'Lista paginada de cambios auditados del usuario: cambios de rol, activación/desactivación, etc.',
      security: adminSecurity,
      parameters: [userIdParam, ...paginationParams],
      responses: {
        200: commonResponses.paginated(
          { $ref: '#/components/schemas/UserChangeLog' },
          'Bitácora del usuario interno obtenida exitosamente'
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

export default { paths, schemas };
