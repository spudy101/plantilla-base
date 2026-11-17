// config/swagger/modules/admin/core/promotional-banner.paths.ts

import commonResponses = require('../../../responses/common.responses');

/**
 * ============================================================
 * PROMOTIONAL BANNER PATHS — ADMIN
 * ============================================================
 * Módulo: /admin/api/v1/core/promotional-banners (core, sin subdominio)
 * Mantenedor de los banners promocionales de la landing pública + app cliente.
 * RBAC: módulo `promotionalContent` (READ el GET · UPDATE el PUT · CREATE la imagen).
 *
 * Rutas:
 *   GET  /admin/api/v1/core/promotional-banners        — catálogo completo (activos e inactivos)
 *   PUT  /admin/api/v1/core/promotional-banners        — reemplaza el catálogo completo
 *   POST /admin/api/v1/core/promotional-banners/image  — sube la imagen de un banner a S3
 */

const adminSecurity = [{ bearerAuth: [], idTokenAuth: [] }];
const TAG = 'Admin — Banners Promocionales';

// ─── Schemas ──────────────────────────────────────────────────

const schemas = {
  PromotionalBannerAdminItem: {
    type: 'object',
    description: 'Banner promocional (vista admin: incluye isActive y sortOrder).',
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string', example: 'Descubre las novedades de Base Project' },
      text: { type: 'string', example: 'Explora las nuevas funciones y mejoras que trae Base Project para ti.' },
      tag: { type: 'string', nullable: true, example: 'Nuevo' },
      buttonRoute: { type: 'string', nullable: true, example: '/hub/inicio', description: 'Ruta interna del front a la que lleva el botón.' },
      buttonName: { type: 'string', nullable: true, example: 'Explorar', description: 'Texto visible del botón del banner.' },
      imageUrl: { type: 'string', nullable: true, example: 'https://cdn.base-project.com/banners/novedades.webp' },
      isActive: { type: 'boolean', example: true },
      sortOrder: { type: 'integer', nullable: true, minimum: 1, example: 1 }
    }
  },

  PromotionalBannerAdminListResponse: {
    type: 'object',
    properties: {
      banners: {
        type: 'array',
        description: 'Catálogo completo ordenado por sortOrder ascendente.',
        items: { $ref: '#/components/schemas/PromotionalBannerAdminItem' }
      }
    }
  },

  PromotionalBannerReplaceRequest: {
    type: 'object',
    required: ['banners'],
    description:
      'Reemplazo COMPLETO del catálogo: lo que no venga en el arreglo se elimina. ' +
      'Los banners sin `id` se crean (el backend les asigna uno).',
    properties: {
      banners: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'object',
          required: ['title', 'text'],
          properties: {
            id: { type: 'string', format: 'uuid', nullable: true, description: 'Omitir (o null) para crear un banner nuevo.' },
            title: { type: 'string', minLength: 1, maxLength: 120 },
            text: { type: 'string', minLength: 1, maxLength: 500 },
            tag: { type: 'string', nullable: true, maxLength: 40 },
            buttonRoute: { type: 'string', nullable: true, maxLength: 200 },
            buttonName: { type: 'string', nullable: true, maxLength: 60, description: 'Texto visible del botón del banner.' },
            imageUrl: {
              type: 'string',
              nullable: true,
              maxLength: 500,
              description: 'URL devuelta por POST /promotional-banners/image (o una ya existente).'
            },
            isActive: { type: 'boolean', default: true },
            sortOrder: {
              type: 'integer',
              nullable: true,
              minimum: 1,
              description: 'Si se omite, se asigna la posición del banner en el arreglo (index + 1).'
            }
          }
        }
      }
    }
  },

  PromotionalBannerImageResponse: {
    type: 'object',
    properties: {
      imageUrl: { type: 'string', example: 'https://cdn.base-project.com/banners/novedades.webp' },
      s3Key: { type: 'string', example: 'promotional/banners/8c6a2f3e-1b2c-4d5e-9f00-aa11bb22cc33.webp' }
    }
  }
};

// ─── Paths ────────────────────────────────────────────────────

const paths = {
  '/admin/api/v1/core/promotional-banners': {
    get: {
      tags: [TAG],
      summary: 'Listar banners promocionales (catálogo completo)',
      operationId: 'adminListPromotionalBanners',
      description:
        'Catálogo completo de banners (activos e inactivos), ordenado por `sortOrder`. ' +
        'Requiere permiso `promotionalContent:READ`. La vista pública (solo activos, sin isActive/sortOrder) ' +
        'es `GET /client/api/v1/core/promotional-banners`.',
      security: adminSecurity,
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/PromotionalBannerAdminListResponse' },
          'Banners promocionales obtenidos exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    },

    put: {
      tags: [TAG],
      summary: 'Reemplazar el catálogo de banners',
      operationId: 'adminReplacePromotionalBanners',
      description:
        'Reemplaza el catálogo COMPLETO de banners (máximo 20): lo que no venga en `banners` se elimina, ' +
        'lo que venga sin `id` se crea. Requiere permiso `promotionalContent:UPDATE`. ' +
        'Devuelve el catálogo resultante (misma respuesta del GET). ' +
        'Las imágenes que dejan de estar referenciadas y fueron subidas por `POST …/image` ' +
        '(prefijo `promotional/banners/`) se borran de S3 automáticamente; las URLs externas no se tocan.',
      security: adminSecurity,
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/PromotionalBannerReplaceRequest' } }
        }
      },
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/PromotionalBannerAdminListResponse' },
          'Banners promocionales actualizados exitosamente'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/core/promotional-banners/image': {
    post: {
      tags: [TAG],
      summary: 'Subir imagen de banner',
      operationId: 'adminUploadPromotionalBannerImage',
      description:
        'Sube la imagen de un banner a S3 y devuelve su URL para usarla como `imageUrl` en el PUT del catálogo. ' +
        'Multipart, campo `image`, formatos PNG/JPEG/WebP, tamaño máximo 10 MB. ' +
        'Requiere permiso `promotionalContent:CREATE`.',
      security: adminSecurity,
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['image'],
              properties: {
                image: { type: 'string', format: 'binary', description: 'Imagen PNG, JPEG o WebP (≤ 10 MB).' }
              }
            }
          }
        }
      },
      responses: {
        201: commonResponses.created(
          { $ref: '#/components/schemas/PromotionalBannerImageResponse' },
          'Imagen del banner subida exitosamente'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  }
};

export = { paths, schemas };
