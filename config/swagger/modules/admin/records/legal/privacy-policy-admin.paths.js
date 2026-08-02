const commonResponses = require('../../../../responses/common.responses');

/**
 * ============================================================
 * PRIVACY POLICY PATHS — ADMIN
 * ============================================================
 * Módulo: /admin/api/v1/records/legal/privacy-policies
 * Todos los endpoints requieren rol ADMIN o SUPER_ADMIN.
 *
 * Rutas:
 *   GET  /admin/api/v1/records/legal/privacy-policies
 *   GET  /admin/api/v1/records/legal/privacy-policies/:privacyPolicyId
 *   POST /admin/api/v1/records/legal/privacy-policies
 *
 * Flujo de publicación:
 *   1. El admin sube el PDF de la nueva versión (multipart/form-data).
 *   2. El PDF se almacena en el bucket PÚBLICO de S3 con key predecible:
 *      legal/privacy-policy-v{version}.pdf  (ej: legal/privacy-policy-v1-1.pdf)
 *   3. Se invalida el caché de CloudFront para que el archivo sea visible de inmediato.
 *   4. Se crea el registro en BD con la URL pública de CloudFront.
 *      El repositorio desactiva automáticamente la versión anterior (is_active → false).
 *
 * Nota: el document_url es una URL PÚBLICA de CloudFront, no una presigned URL.
 * Solo se expone en el detalle y en la respuesta de creación — no en el listado.
 */

// ─── Schemas ──────────────────────────────────────────────────

const schemas = {
  // ── PrivacyPolicy (item de lista) ─────────────────────────────
  AdminPrivacyPolicyItem: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      version: {
        type: 'string',
        example: '1.1',
        description: 'Versión en formato N.N (ej: 1.0, 2.0)'
      },
      isActive: { type: 'boolean', description: 'Solo una versión puede estar activa a la vez' },
      summary: {
        type: 'string',
        nullable: true,
        description: 'Resumen de cambios respecto a la versión anterior'
      },
      effectiveDate: {
        type: 'string',
        format: 'date-time',
        description: 'Fecha desde la que esta versión está vigente'
      },
      createdAt: { type: 'string', format: 'date-time' }
    }
  },

  // ── PrivacyPolicy (detalle — incluye documentUrl) ─────────────
  AdminPrivacyPolicyDetail: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      version: { type: 'string', example: '1.1' },
      isActive: { type: 'boolean' },
      summary: { type: 'string', nullable: true },
      documentUrl: {
        type: 'string',
        format: 'uri',
        description: 'URL pública de CloudFront del PDF. Permanente mientras el archivo exista en S3.',
        example: 'https://cdn.base-project.com/legal/privacy-policy-v1-1.pdf'
      },
      effectiveDate: { type: 'string', format: 'date-time' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' }
    }
  },

  // ── Request de creación ───────────────────────────────────────
  AdminPrivacyPolicyCreateRequest: {
    type: 'object',
    required: ['policyDocument', 'version'],
    properties: {
      policyDocument: {
        type: 'string',
        format: 'binary',
        description: 'PDF de la política de privacidad. Máximo 20 MB.'
      },
      version: {
        type: 'string',
        pattern: '^\\d+\\.\\d+$',
        example: '1.1',
        description:
          'Número de versión en formato N.N (ej: 1.0, 1.1, 2.0). Debe ser único — no se puede reutilizar una versión existente.'
      },
      summary: {
        type: 'string',
        maxLength: 1000,
        nullable: true,
        example: 'Se añadió la sección de tratamiento de datos biométricos.',
        description: 'Resumen de los cambios respecto a la versión anterior (opcional).'
      },
      effectiveDate: {
        type: 'string',
        format: 'date-time',
        nullable: true,
        example: '2025-06-01T00:00:00Z',
        description: 'Fecha y hora de entrada en vigor (ISO 8601). Si no se envía, se usa la fecha actual.'
      }
    }
  }
};

// ─── Parámetros comunes ────────────────────────────────────────

const privacyPolicyIdParam = {
  name: 'privacyPolicyId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
  description: 'UUID de la versión de la política de privacidad'
};

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

// ─── Paths ────────────────────────────────────────────────────

const paths = {
  '/admin/api/v1/records/legal/privacy-policies': {
    get: {
      tags: ['Admin - Política de Privacidad'],
      summary: 'Listar versiones de la política de privacidad',
      operationId: 'adminListPrivacyPolicies',
      description: `Lista paginada de todas las versiones de la política de privacidad.

El campo \`documentUrl\` **no** se incluye en el listado — solo en el detalle y en la respuesta de creación.

Filtros disponibles: \`search\` (busca en \`version\` y \`summary\`) e \`isActive\`.`,
      security: [{ bearerAuth: [], idTokenAuth: [] }],
      parameters: [
        ...paginationParams,
        {
          name: 'search',
          in: 'query',
          schema: { type: 'string' },
          description: 'Búsqueda por versión o resumen'
        },
        {
          name: 'isActive',
          in: 'query',
          schema: { type: 'boolean' },
          description: 'Filtrar por estado activo'
        }
      ],
      responses: {
        200: commonResponses.paginated(
          { $ref: '#/components/schemas/AdminPrivacyPolicyItem' },
          'Versiones de política de privacidad obtenidas exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    },

    post: {
      tags: ['Admin - Política de Privacidad'],
      summary: 'Publicar nueva versión de la política',
      operationId: 'adminCreatePrivacyPolicyVersion',
      description: `Publica una nueva versión de la política de privacidad.

**Flujo interno:**
1. Valida que el número de versión no exista ya en BD.
2. Sube el PDF al bucket **público** de S3 con key predecible: \`legal/privacy-policy-v{version}.pdf\`.
3. Invalida el caché de CloudFront para visibilidad inmediata.
4. Crea el registro en BD y **desactiva automáticamente la versión anterior** (\`is_active → false\`).

⚠️ El número de versión no puede reutilizarse. Para corregir un PDF ya publicado se debe crear una nueva versión.`,
      security: [{ bearerAuth: [], idTokenAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: { $ref: '#/components/schemas/AdminPrivacyPolicyCreateRequest' }
          }
        }
      },
      responses: {
        201: commonResponses.created(
          { $ref: '#/components/schemas/AdminPrivacyPolicyDetail' },
          'Nueva versión de política de privacidad publicada exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.Conflict,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/records/legal/privacy-policies/{privacyPolicyId}': {
    get: {
      tags: ['Admin - Política de Privacidad'],
      summary: 'Obtener detalle de una versión',
      operationId: 'adminGetPrivacyPolicyDetail',
      description: `Retorna el detalle completo de una versión de la política incluyendo \`documentUrl\`, la URL pública permanente de CloudFront donde se puede leer el PDF.

A diferencia de los documentos de usuario, esta URL **no expira** — es una URL pública de CloudFront, no una presigned URL.`,
      security: [{ bearerAuth: [], idTokenAuth: [] }],
      parameters: [privacyPolicyIdParam],
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/AdminPrivacyPolicyDetail' },
          'Detalle de política de privacidad obtenido exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.InternalServerError
      }
    }
  }
};

module.exports = { paths, schemas };
