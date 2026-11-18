import commonResponses from '../../../config/swagger/responses/common.responses';
import piiMaskingDocModule from '../../../config/swagger/schemas/pii-masking.doc';
const { MASKED_PHONE_DESC } = piiMaskingDocModule;

/**
 * ============================================================
 * PERSON REFERENCES PATHS — CLIENT
 * ============================================================
 * Módulo: /client/api/v1/kyc/person/person-references
 * Todos los endpoints requieren autenticación (bearerAuth + idTokenAuth)
 *
 * Rutas:
 *   GET    /client/api/v1/kyc/person/person-references
 *   POST   /client/api/v1/kyc/person/person-references
 *   PUT    /client/api/v1/kyc/person/person-references/:referenceId
 *   DELETE /client/api/v1/kyc/person/person-references/:referenceId
 */

// ─── Schemas propios del módulo ───────────────────────────────

const schemas = {
  PersonReference: {
    type: 'object',
    properties: {
      personReferenceId: { type: 'string', format: 'uuid' },
      referenceName: { type: 'string', example: 'María García' },
      referencePhone: {
        type: 'string',
        example: '*********4567',
        description: `Número de teléfono de la referencia. ${MASKED_PHONE_DESC}`
      },
      referenceType: {
        type: 'string',
        enum: ['conocido', 'familiar'],
        example: 'familiar',
        description: '`conocido` = amigo/colega, `familiar` = familiar directo.'
      },
      createdAt: { type: 'string', format: 'date-time' }
    }
  },

  CreatePersonReferenceRequest: {
    type: 'object',
    required: ['referenceName', 'referencePhone', 'referenceType'],
    properties: {
      referenceName: {
        type: 'string',
        minLength: 2,
        maxLength: 200,
        example: 'María García'
      },
      referencePhone: {
        type: 'string',
        example: '+573001234567',
        description: 'Formato libre: 7–20 caracteres, puede incluir +, espacios, guiones y paréntesis.'
      },
      referenceType: {
        type: 'string',
        enum: ['conocido', 'familiar'],
        example: 'conocido'
      }
    }
  },

  UpdatePersonReferenceRequest: {
    type: 'object',
    description: 'Todos los campos son opcionales. Debe enviarse al menos uno.',
    properties: {
      referenceName: {
        type: 'string',
        minLength: 2,
        maxLength: 200,
        example: 'María García López'
      },
      referencePhone: {
        type: 'string',
        example: '+573009876543'
      },
      referenceType: {
        type: 'string',
        enum: ['conocido', 'familiar']
      }
    }
  }
};

// ─── Params comunes ───────────────────────────────────────────

const referenceIdParam = {
  name: 'referenceId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
  description: 'ID de la referencia personal.'
};

// ─── Paths ────────────────────────────────────────────────────

const paths = {
  // ── GET /kyc/person-references ────────────────────────────────
  '/client/api/v1/kyc/person/person-references': {
    get: {
      tags: ['Referencias Personales'],
      summary: 'Listar mis referencias',
      operationId: 'listPersonReferences',
      description: 'Retorna todas las referencias personales y familiares registradas por el usuario autenticado.',
      responses: {
        200: commonResponses.ok(
          { type: 'array', items: { $ref: '#/components/schemas/PersonReference' } },
          'Referencias obtenidas exitosamente.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    },

    post: {
      tags: ['Referencias Personales'],
      summary: 'Registrar referencia',
      operationId: 'createPersonReference',
      description: 'Crea una nueva referencia personal o familiar asociada al usuario autenticado.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreatePersonReferenceRequest' }
          }
        }
      },
      responses: {
        // created(): el builder de 201 (ok() documentaba statusCode 200 e ignoraba el tercer argumento)
        201: commonResponses.created({ $ref: '#/components/schemas/PersonReference' }, 'Referencia registrada exitosamente.'),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── PUT /kyc/person-references/:referenceId ───────────────────
  '/client/api/v1/kyc/person/person-references/{referenceId}': {
    put: {
      tags: ['Referencias Personales'],
      summary: 'Actualizar referencia',
      operationId: 'updatePersonReference',
      parameters: [referenceIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdatePersonReferenceRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/PersonReference' }, 'Referencia actualizada exitosamente.'),
        ...commonResponses.BadRequest,
        ...commonResponses.NotFound,
        ...commonResponses.Unauthorized,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    },

    delete: {
      tags: ['Referencias Personales'],
      summary: 'Eliminar referencia',
      operationId: 'deletePersonReference',
      parameters: [referenceIdParam],
      responses: {
        200: commonResponses.ok({ type: 'object', nullable: true }, 'Referencia eliminada exitosamente.'),
        ...commonResponses.NotFound,
        ...commonResponses.Unauthorized,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  }
};

export default { paths, schemas };
