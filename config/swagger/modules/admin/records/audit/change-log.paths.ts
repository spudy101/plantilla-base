import commonResponses from '../../../../responses/common.responses';

/**
 * ============================================================
 * CHANGE LOG PATHS — ADMIN  (RF-ADM-03)
 * ============================================================
 * Módulo: /admin/api/v1/records/audit/change-logs
 * Todos los endpoints requieren rol ADMIN, SUPER_ADMIN o AUDITOR_INTERNO (solo lectura).
 *
 * Rutas:
 *   GET /admin/api/v1/records/audit/change-logs/users
 */

const schemas = {
  AdminChangeLogItem: {
    type: 'object',
    properties: {
      logId: { type: 'string', format: 'uuid' },
      userId: { type: 'string', format: 'uuid', nullable: true, description: 'UUID del usuario afectado por el cambio.' },
      user: {
        type: 'object',
        nullable: true,
        description: 'Información del usuario afectado.',
        properties: {
          userId: { type: 'string', format: 'uuid' },
          username: { type: 'string', example: 'jdoe' },
          fullName: { type: 'string', nullable: true, example: 'John Doe' }
        }
      },
      changedByUserId: { type: 'string', format: 'uuid', nullable: true, description: 'UUID del usuario que realizó el cambio.' },
      changedByRole: { type: 'string', example: 'admin', description: 'Rol del ejecutor del cambio.' },
      changedBy: {
        type: 'object',
        nullable: true,
        description: 'Información del usuario que realizó el cambio. Null si fue ejecutado por el sistema.',
        properties: {
          userId: { type: 'string', format: 'uuid' },
          username: { type: 'string', example: 'admin01' },
          fullName: { type: 'string', nullable: true, example: 'María García' }
        }
      },
      changeType: { type: 'string', example: 'email', description: 'Tipo de campo o entidad que cambió' },
      previousValue: {
        type: 'string',
        nullable: true,
        description:
          'Valor anterior. Si es un correo, documento o teléfono sale **enmascarado** (RF-USR-01 CA-6); ' +
          'los valores sin forma de PII (p. ej. `activo`) se devuelven tal cual. Las contraseñas van como `hidden`.'
      },
      newValue: {
        type: 'string',
        nullable: true,
        description: 'Valor nuevo. Mismo criterio de enmascaramiento que `previousValue`.'
      },
      changeReason: { type: 'string', nullable: true },
      ipAddress: { type: 'string', nullable: true, example: '192.168.1.1' },
      userAgent: { type: 'string', nullable: true },
      originSessionId: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description: 'Sesión de origen sellada al registrar el cambio (trazabilidad, RF-ADM-03). null si lo hizo un worker.'
      },
      createdAt: { type: 'string', format: 'date-time' }
    }
  }
};

const paginationParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
  { name: 'sortBy', in: 'query', schema: { type: 'string' } },
  { name: 'order', in: 'query', schema: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC' } }
];

const adminSecurity = [{ bearerAuth: [], idTokenAuth: [] }];

const changeLogFilters = [
  { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Filtrar por usuario afectado' },
  { name: 'changedByRole', in: 'query', schema: { type: 'string', enum: ['admin', 'user', 'system'] } },
  {
    name: 'changeType',
    in: 'query',
    schema: { type: 'string', enum: ['email', 'password', 'mfa_status', 'account_status', 'role', 'national_id'] }
  },
  { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
  { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } }
];

const paths = {
  '/admin/api/v1/records/audit/change-logs/users': {
    get: {
      tags: ['Admin - Auditoría / Bitácora de Cambios'],
      summary: 'Bitácora de cambios de usuarios',
      operationId: 'adminListUserChangeLogs',
      description: `Lista paginada de cambios realizados sobre cuentas de usuario.

Registra: cambios de contraseña, email, national_id, rol, estado de cuenta, MFA y eliminación de cuenta. Los valores sensibles como contraseñas aparecen enmascarados como \`"hidden"\`, y \`previousValue\`/\`newValue\` salen **enmascarados** cuando tienen forma de correo, documento o teléfono (RF-USR-01 CA-6).`,
      security: adminSecurity,
      parameters: [
        ...paginationParams,
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Búsqueda de texto libre' },
        ...changeLogFilters
      ],
      responses: {
        200: commonResponses.paginated(
          { $ref: '#/components/schemas/AdminChangeLogItem' },
          'Bitácora de cambios de usuarios obtenida exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  }
};

export default { paths, schemas };
