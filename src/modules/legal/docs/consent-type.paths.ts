import commonResponses from '../../../config/swagger/responses/common.responses';

/**
 * ============================================================
 * CONSENT TYPE PATHS — ADMIN  (RF-ADM-04)
 * ============================================================
 * Módulo: /admin/api/v1/records/legal/consent-types
 * Roles: ADMIN_ACCESS_ROLES
 *
 * Rutas:
 *   GET    /admin/api/v1/records/legal/consent-types
 *   POST   /admin/api/v1/records/legal/consent-types
 *   GET    /admin/api/v1/records/legal/consent-types/:consentTypeId
 *   PATCH  /admin/api/v1/records/legal/consent-types/:consentTypeId
 */

const schemas = {
  ConsentTypeItem: {
    type: 'object',
    description: 'Tipo de consentimiento — elemento de catálogo.',
    properties: {
      consentTypeId: { type: 'string', format: 'uuid' },
      code: {
        type: 'string',
        example: 'PRIVACY_POLICY',
        description: 'Código único en mayúsculas. Ej: PRIVACY_POLICY, CREDIT_BUREAU_QUERY.'
      },
      name: { type: 'string', example: 'Política de Privacidad y Tratamiento de Datos' },
      isMandatory: { type: 'boolean', description: 'true = obligatorio para acceder al servicio.' },
      isRevocable: { type: 'boolean', description: 'true = el usuario puede revocarlo en cualquier momento.' },
      isActive: { type: 'boolean' },
      scope: {
        type: 'string',
        enum: ['ONBOARDING'],
        example: 'ONBOARDING',
        description:
          'Momento en que se captura el consentimiento. ONBOARDING = durante la vinculación del cliente. ' +
          'Punto de extensión: agrega tus propios scopes (y actualiza el CHECK de la tabla) para gatear operaciones de tu dominio.'
      },
      createdAt: { type: 'string', format: 'date-time' }
    }
  },

  ConsentTypeDetail: {
    allOf: [
      { $ref: '#/components/schemas/ConsentTypeItem' },
      {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            nullable: true,
            example: 'Autorización de tratamiento de datos personales conforme a la Ley 1581/2012.'
          },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      }
    ]
  }
};

const paths = {
  '/admin/api/v1/records/legal/consent-types': {
    get: {
      tags: ['Admin — Consentimientos'],
      summary: 'Listar tipos de consentimiento',
      description: 'Lista paginada del catálogo de tipos de consentimiento. Roles: ADMIN_ACCESS_ROLES.',
      operationId: 'adminListConsentTypes',
      security: [{ bearerAuth: [] }, { idTokenAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Busca en código, nombre y descripción.' }
      ],
      responses: {
        200: commonResponses.paginated(
          { $ref: '#/components/schemas/ConsentTypeItem' },
          'Tipos de consentimiento obtenidos exitosamente.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    },
    post: {
      tags: ['Admin — Consentimientos'],
      summary: 'Crear tipo de consentimiento',
      description:
        'Crea un nuevo tipo de consentimiento en el catálogo. El código debe ser único en mayúsculas (solo letras y guiones bajos). Roles: ADMIN_ACCESS_ROLES.',
      operationId: 'adminCreateConsentType',
      security: [{ bearerAuth: [] }, { idTokenAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['code', 'name'],
              properties: {
                code: {
                  type: 'string',
                  example: 'CREDIT_BUREAU_QUERY',
                  description: 'Identificador único. Solo mayúsculas y guiones bajos.'
                },
                name: { type: 'string', example: 'Autorización consulta centrales de riesgo' },
                description: { type: 'string', nullable: true },
                isMandatory: { type: 'boolean', default: true, description: 'false = consentimiento opcional (ej: marketing).' },
                isRevocable: {
                  type: 'boolean',
                  default: false,
                  description: 'true = el usuario puede revocarlo. Solo para tipos opcionales.'
                }
              }
            }
          }
        }
      },
      responses: {
        201: commonResponses.created(
          { $ref: '#/components/schemas/ConsentTypeDetail' },
          'Tipo de consentimiento creado exitosamente.'
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

  '/admin/api/v1/records/legal/consent-types/{consentTypeId}': {
    get: {
      tags: ['Admin — Consentimientos'],
      summary: 'Detalle de tipo de consentimiento',
      operationId: 'adminGetConsentType',
      security: [{ bearerAuth: [] }, { idTokenAuth: [] }],
      parameters: [{ name: 'consentTypeId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/ConsentTypeDetail' }),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.InternalServerError
      }
    },
    patch: {
      tags: ['Admin — Consentimientos'],
      summary: 'Actualizar tipo de consentimiento',
      description:
        'Permite cambiar nombre, descripción y estado activo/inactivo. El código y los flags isMandatory/isRevocable no son editables una vez creados. Roles: ADMIN_ACCESS_ROLES.',
      operationId: 'adminUpdateConsentType',
      security: [{ bearerAuth: [] }, { idTokenAuth: [] }],
      parameters: [{ name: 'consentTypeId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string', nullable: true },
                isActive: { type: 'boolean' }
              }
            }
          }
        }
      },
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/ConsentTypeDetail' }),
        ...commonResponses.BadRequest,
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
