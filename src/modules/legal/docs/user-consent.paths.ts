import commonResponses from '../../../config/swagger/responses/common.responses';

/**
 * ============================================================
 * USER CONSENT PATHS — CLIENT  (RF-ADM-04)
 * ============================================================
 * Módulo: /client/api/v1/records/legal/consents
 * Roles: CLIENT_ACCESS_ROLES
 *
 * Rutas:
 *   GET  /client/api/v1/records/legal/consents
 *   POST /client/api/v1/records/legal/consents/grant
 *   POST /client/api/v1/records/legal/consents/:consentTypeId/revoke
 *
 * Fundamento legal:
 *   Ley 1581/2012 — Protección de Datos Personales
 *   Decreto 1377/2013 — Reglamentación de consentimientos
 */

const schemas = {
  MyConsentCatalogItem: {
    type: 'object',
    description:
      'Item del catálogo de consentimientos para el usuario autenticado. ' +
      'Incluye TODOS los tipos de consentimiento activos (no solo los otorgados), de modo que el ' +
      'cliente puede mostrar y activar tipos que el usuario aún no ha aceptado. El flag `granted` ' +
      'indica si el usuario tiene un consentimiento vigente para ese tipo.',
    properties: {
      consentType: {
        type: 'object',
        nullable: true,
        properties: {
          consentTypeId: { type: 'string', format: 'uuid' },
          code: { type: 'string', example: 'PRIVACY_POLICY' },
          name: { type: 'string', example: 'Política de Privacidad y Tratamiento de Datos' },
          isMandatory: { type: 'boolean' },
          isRevocable: { type: 'boolean', description: 'true = puede ser revocado por el usuario.' },
          isActive: { type: 'boolean' },
          scope: {
            type: 'string',
            enum: ['ONBOARDING'],
            description: 'Momento en que aplica el consentimiento.'
          }
        }
      },
      granted: {
        type: 'boolean',
        description: 'true = el usuario tiene un consentimiento vigente para este tipo; false = disponible, aún no otorgado.'
      },
      userConsentId: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description: 'ID del otorgamiento vigente. null cuando granted = false.'
      },
      privacyPolicy: {
        type: 'object',
        nullable: true,
        description: 'Versión de política aceptada. Solo presente para el tipo PRIVACY_POLICY otorgado.',
        properties: {
          privacyPolicyId: { type: 'string', format: 'uuid' },
          version: { type: 'string', example: '1.0' },
          documentUrl: { type: 'string', format: 'uri', description: 'URL pública del PDF.' },
          effectiveDate: { type: 'string', format: 'date-time' }
        }
      },
      grantedAt: {
        type: 'string',
        format: 'date-time',
        nullable: true,
        description: 'Fecha y hora de aceptación. null cuando granted = false.'
      },
      revokedAt: { type: 'string', format: 'date-time', nullable: true },
      isCurrent: { type: 'boolean', description: 'false cuando granted = false.' }
    }
  },

  ConsentGrantInput: {
    type: 'object',
    required: ['consentTypeCode'],
    properties: {
      consentTypeCode: {
        type: 'string',
        example: 'COMUNICACIONES_COMERCIALES',
        description:
          'Código del tipo de consentimiento a otorgar. ' +
          'Valores base: `PRIVACY_POLICY`, `COMUNICACIONES_COMERCIALES`.'
      },
      privacyPolicyId: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description: 'ID de la versión de política aceptada. Requerido cuando consentTypeCode = PRIVACY_POLICY.'
      }
    }
  },

  ConsentGranted: {
    type: 'object',
    properties: {
      userConsentId: { type: 'string', format: 'uuid' },
      consentTypeId: { type: 'string', format: 'uuid' },
      grantedAt: { type: 'string', format: 'date-time' },
      isCurrent: { type: 'boolean' }
    }
  }
};

const paths = {
  '/client/api/v1/records/legal/consents': {
    get: {
      tags: ['Client — Consentimientos'],
      summary: 'Catálogo de consentimientos con estado del usuario',
      description:
        'Retorna TODOS los tipos de consentimiento activos del catálogo (scope `ONBOARDING`), ' +
        'cada uno anotado con el estado de otorgamiento del usuario autenticado (`granted`). ' +
        'Esto permite al cliente mostrar y activar consentimientos que el usuario aún no ha aceptado, ' +
        'no solo los ya otorgados. Cuando `granted = false`, los campos de otorgamiento ' +
        '(`userConsentId`, `privacyPolicy`, `grantedAt`) vienen en null e `isCurrent = false`. ' +
        'Criterio RF-ADM-04: el usuario puede consultar en su perfil todos los consentimientos.',
      operationId: 'clientGetMyConsents',
      security: [{ bearerAuth: [] }],
      responses: {
        200: commonResponses.ok(
          { type: 'array', items: { $ref: '#/components/schemas/MyConsentCatalogItem' } },
          'Consentimientos obtenidos exitosamente.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden
      }
    }
  },

  '/client/api/v1/records/legal/consents/grant': {
    post: {
      tags: ['Client — Consentimientos'],
      summary: 'Otorgar consentimientos',
      description:
        'Registra la aceptación explícita de uno o varios consentimientos. ' +
        'Cada consentimiento queda registrado como un registro independiente con timestamp, IP y user-agent. ' +
        'Usado al momento del registro (RF-AUTH-01) y para re-aceptaciones tras actualización de política. ' +
        'Ley 1581/2012 — consentimiento previo, informado y expreso.',
      operationId: 'clientGrantConsents',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/components/schemas/ConsentGrantInput' },
              example: [{ consentTypeCode: 'COMUNICACIONES_COMERCIALES' }]
            }
          }
        }
      },
      responses: {
        201: commonResponses.created(
          { type: 'array', items: { $ref: '#/components/schemas/ConsentGranted' } },
          'Consentimientos registrados exitosamente.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.ValidationError
      }
    }
  },

  '/client/api/v1/records/legal/consents/{consentTypeId}/revoke': {
    post: {
      tags: ['Client — Consentimientos'],
      summary: 'Revocar consentimiento opcional',
      description:
        'Revoca un consentimiento opcional (is_revocable = true). ' +
        'Aplica para consentimientos opcionales como `COMUNICACIONES_COMERCIALES`. ' +
        'Los consentimientos obligatorios (`PRIVACY_POLICY`) no pueden ser revocados por esta vía. ' +
        'La revocación no afecta el acceso al servicio (Ley 1581/2012, criterio RF-ADM-04).',
      operationId: 'clientRevokeConsent',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'consentTypeId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del tipo de consentimiento a revocar.'
        }
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                reason: {
                  type: 'string',
                  nullable: true,
                  maxLength: 500,
                  example: 'Ya no deseo recibir comunicaciones comerciales.'
                }
              }
            }
          }
        }
      },
      responses: {
        200: commonResponses.ok(null, 'Consentimiento revocado exitosamente.'),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.ValidationError
      }
    }
  }
};

export default { paths, schemas };
