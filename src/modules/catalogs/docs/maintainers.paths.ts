import commonResponses from '../../../config/swagger/responses/common.responses';

// ─── Schemas propios del módulo ───────────────────────────────

const schemas = {
  DocumentType: {
    type: 'object',
    properties: {
      documentTypeId: { type: 'string', format: 'uuid' },
      code: { type: 'string', example: 'CC', description: 'Código interno del tipo de documento.' },
      name: { type: 'string', example: 'Cédula de Ciudadanía' },
      description: {
        type: 'string',
        nullable: true,
        example: 'Documento de identidad para ciudadanos colombianos.'
      },
      isActive: { type: 'boolean', example: true }
    }
  },

  FundsOriginType: {
    type: 'object',
    properties: {
      fundsOriginTypeId: { type: 'string', format: 'uuid' },
      code: {
        type: 'string',
        example: 'SALARY',
        description: 'Código interno del tipo de origen.'
      },
      name: { type: 'string', example: 'Salario' },
      requiresDescription: {
        type: 'boolean',
        example: false,
        description: 'Si es `true`, el campo `fundsOriginDescription` es obligatorio al registrar el empleo.'
      },
      isActive: { type: 'boolean', example: true }
    }
  }
};

// ─── Parámetros comunes de paginación ─────────────────────────

const paginationParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
  { name: 'search', in: 'query', schema: { type: 'string' } },
  { name: 'sortBy', in: 'query', schema: { type: 'string' } },
  { name: 'order', in: 'query', schema: { type: 'string', enum: ['ASC', 'DESC'] } },
  { name: 'isActive', in: 'query', schema: { type: 'boolean' } }
];

// ─── Paths ────────────────────────────────────────────────────

const paths = {
  // GET /client/api/v1/kyc/maintainers/funds-origin-types
  '/client/api/v1/kyc/maintainers/funds-origin-types': {
    get: {
      tags: ['Maintainers'],
      summary: 'Listar tipos de origen de fondos',
      operationId: 'listFundsOriginTypes',
      security: [],
      description:
        'Retorna los tipos de origen de fondos activos. El campo `requiresDescription` indica si al seleccionar este tipo es obligatorio enviar `fundsOriginDescription` en el registro laboral.',
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/FundsOriginType' }),
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // GET /client/api/v1/kyc/maintainers/document-types
  '/client/api/v1/kyc/maintainers/document-types': {
    get: {
      tags: ['Maintainers'],
      summary: 'Listar tipos de documento',
      operationId: 'listDocumentTypes',
      security: [],
      description:
        'Retorna todos los tipos de documento de identidad disponibles en el sistema (ej: Cédula de Ciudadanía, Pasaporte, NIT). No soporta paginación ni filtros.',
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/DocumentType' }),
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // GET /client/api/v1/kyc/maintainers/genders
  '/client/api/v1/kyc/maintainers/genders': {
    get: {
      tags: ['Maintainers'],
      summary: 'Listar géneros',
      operationId: 'listGenders',
      security: [],
      parameters: [...paginationParams],
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/Gender' }),
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // GET /client/api/v1/kyc/maintainers/phone-prefixes
  '/client/api/v1/kyc/maintainers/phone-prefixes': {
    get: {
      tags: ['Maintainers'],
      summary: 'Listar prefijos telefónicos',
      operationId: 'listPhonePrefixes',
      security: [],
      parameters: [...paginationParams, { name: 'countryId', in: 'query', schema: { type: 'string', format: 'uuid' } }],
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/PhonePrefix' }),
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // GET /client/api/v1/kyc/maintainers/countries
  '/client/api/v1/kyc/maintainers/countries': {
    get: {
      tags: ['Maintainers'],
      summary: 'Listar países',
      operationId: 'listCountries',
      security: [],
      parameters: [...paginationParams],
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/Country' }),
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // GET /client/api/v1/kyc/maintainers/departments
  '/client/api/v1/kyc/maintainers/departments': {
    get: {
      tags: ['Maintainers'],
      summary: 'Listar departamentos / regiones',
      operationId: 'listDepartments',
      security: [],
      parameters: [...paginationParams, { name: 'countryId', in: 'query', schema: { type: 'string', format: 'uuid' } }],
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/Department' }),
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // GET /client/api/v1/kyc/maintainers/cities
  '/client/api/v1/kyc/maintainers/cities': {
    get: {
      tags: ['Maintainers'],
      summary: 'Listar ciudades',
      operationId: 'listCities',
      security: [],
      parameters: [...paginationParams, { name: 'departmentId', in: 'query', schema: { type: 'string', format: 'uuid' } }],
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/City' }),
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // GET /client/api/v1/kyc/maintainers/avatars
  '/client/api/v1/kyc/maintainers/avatars': {
    get: {
      tags: ['Maintainers'],
      summary: 'Listar avatares',
      operationId: 'listAvatars',
      security: [],
      parameters: [...paginationParams, { name: 'themeId', in: 'query', schema: { type: 'string', format: 'uuid' } }],
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/Avatar' }),
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // GET /client/api/v1/kyc/maintainers/avatar-themes
  '/client/api/v1/kyc/maintainers/avatar-themes': {
    get: {
      tags: ['Maintainers'],
      summary: 'Listar temas de avatares',
      operationId: 'listAvatarThemes',
      security: [],
      parameters: [...paginationParams],
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/AvatarTheme' }),
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // GET /client/api/v1/kyc/maintainers/notification-types
  '/client/api/v1/kyc/maintainers/notification-types': {
    get: {
      tags: ['Maintainers'],
      summary: 'Listar tipos de notificación',
      operationId: 'listNotificationTypes',
      security: [],
      parameters: [
        ...paginationParams,
        { name: 'supportsPush', in: 'query', schema: { type: 'boolean' } },
        { name: 'supportsEmail', in: 'query', schema: { type: 'boolean' } },
        { name: 'priority', in: 'query', schema: { type: 'string', example: 'high' } }
      ],
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/NotificationType' }),
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // GET /client/api/v1/kyc/maintainers/roles
  '/client/api/v1/kyc/maintainers/roles': {
    get: {
      tags: ['Maintainers'],
      summary: 'Listar roles del sistema',
      operationId: 'listRoles',
      security: [],
      parameters: [...paginationParams],
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/Role' }),
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // GET /client/api/v1/kyc/maintainers/privacy-policy/active
  '/client/api/v1/kyc/maintainers/privacy-policy/active': {
    get: {
      tags: ['Maintainers'],
      summary: 'Obtener política de privacidad activa',
      operationId: 'getActivePrivacyPolicy',
      security: [],
      description:
        'Retorna la versión de la política de privacidad actualmente vigente. Útil para mostrar al usuario el documento antes de registrarse.',
      responses: {
        200: commonResponses.ok(
          {
            type: 'object',
            properties: {
              version: {
                type: 'string',
                example: '1.0',
                description: 'Versión semántica de la política'
              },
              documentUrl: {
                type: 'string',
                format: 'uri',
                example: 'https://s3.amazonaws.com/...policy-v1.pdf',
                description: 'URL pública del documento PDF'
              },
              summary: {
                type: 'string',
                nullable: true,
                example: 'Versión inicial de la política de privacidad'
              },
              effectiveDate: {
                type: 'string',
                format: 'date-time',
                example: '2026-04-18T00:00:00.000Z'
              }
            }
          },
          'Política de privacidad activa obtenida exitosamente'
        ),
        ...commonResponses.InternalServerError
      }
    }
  }
};

export default { paths, schemas };
