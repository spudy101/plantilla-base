const commonResponses = require('../../../../responses/common.responses');

/**
 * ============================================================
 * USER CONSENT AUDIT PATHS — ADMIN  (RF-ADM-04)
 * ============================================================
 * Módulo: /admin/api/v1/records/legal/user-consents
 * Roles: SUPERADMIN, AUDITOR_INTERNO
 *
 * Rutas:
 *   GET /admin/api/v1/records/legal/user-consents
 *   GET /admin/api/v1/records/legal/user-consents/users/:userId
 */

const schemas = {
  UserConsentAuditItem: {
    type: 'object',
    description: 'Registro de auditoría de un consentimiento otorgado o revocado por un usuario.',
    properties: {
      userConsentId: { type: 'string', format: 'uuid' },
      userId: { type: 'string', format: 'uuid' },
      user: {
        type: 'object',
        nullable: true,
        description: 'Usuario que generó el consentimiento.',
        properties: {
          userId: { type: 'string', format: 'uuid' },
          username: { type: 'string', example: 'jperez' },
          fullName: { type: 'string', nullable: true, example: 'Juan Pérez' }
        }
      },
      consentType: {
        type: 'object',
        nullable: true,
        properties: {
          consentTypeId: { type: 'string', format: 'uuid' },
          code: { type: 'string', example: 'PRIVACY_POLICY' },
          name: { type: 'string', example: 'Política de Privacidad y Tratamiento de Datos' },
          isMandatory: { type: 'boolean' },
          isRevocable: { type: 'boolean' },
          isActive: { type: 'boolean' },
          scope: { type: 'string', nullable: true, example: 'ONBOARDING' }
        }
      },
      privacyPolicy: {
        type: 'object',
        nullable: true,
        description: 'Versión de la política aceptada. Solo presente para el tipo PRIVACY_POLICY.',
        properties: {
          privacyPolicyId: { type: 'string', format: 'uuid' },
          version: { type: 'string', example: '1.0' },
          documentUrl: { type: 'string', format: 'uri' },
          effectiveDate: { type: 'string', format: 'date-time' }
        }
      },
      grantedAt: { type: 'string', format: 'date-time', description: 'Fecha y hora de aceptación.' },
      grantedIp: { type: 'string', nullable: true, example: '190.114.45.227' },
      revokedAt: { type: 'string', format: 'date-time', nullable: true },
      revocationReason: { type: 'string', nullable: true },
      isCurrent: { type: 'boolean', description: 'true = consentimiento vigente para este usuario y tipo.' },
      originSessionId: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description: 'Sesión de origen sellada al registrar el consentimiento (trazabilidad, RF-ADM-03 / RF-ADM-04). null si lo hizo un worker.'
      },
      createdAt: { type: 'string', format: 'date-time' }
    }
  }
};

const paths = {
  '/admin/api/v1/records/legal/user-consents': {
    get: {
      tags: ['Admin — Auditoría de Consentimientos'],
      summary: 'Listar consentimientos de usuarios',
      description:
        'Lista paginada de todos los registros de consentimiento con filtros. ' +
        'Permite auditar qué usuarios aceptaron o revocaron qué consentimientos y cuándo. ' +
        'Roles: SUPERADMIN, AUDITOR_INTERNO.',
      operationId: 'adminListUserConsents',
      security: [{ bearerAuth: [] }, { idTokenAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Filtrar por usuario.' },
        {
          name: 'consentTypeCode',
          in: 'query',
          schema: { type: 'string', example: 'PRIVACY_POLICY' },
          description: 'Filtrar por código de tipo.'
        },
        {
          name: 'isCurrent',
          in: 'query',
          schema: { type: 'boolean' },
          description: 'true = solo vigentes, false = solo históricos.'
        },
        { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date-time' } }
      ],
      responses: {
        200: commonResponses.paginated(
          { $ref: '#/components/schemas/UserConsentAuditItem' },
          'Consentimientos obtenidos exitosamente.'
        ),
        ...commonResponses.ValidationError,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/records/legal/user-consents/users/{userId}': {
    get: {
      tags: ['Admin — Auditoría de Consentimientos'],
      summary: 'Historial de consentimientos de un usuario',
      description:
        'Retorna el historial completo de consentimientos de un usuario específico, ' +
        'incluyendo aceptaciones anteriores y revocaciones. ' +
        'Roles: SUPERADMIN, AUDITOR_INTERNO.',
      operationId: 'adminGetUserConsentHistory',
      security: [{ bearerAuth: [] }, { idTokenAuth: [] }],
      parameters: [
        { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: commonResponses.paginated(
          { $ref: '#/components/schemas/UserConsentAuditItem' },
          'Historial de consentimientos obtenido exitosamente.'
        ),
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
