// config/swagger/modules/shared-endpoints/core/promotional-banner.paths.ts

import commonResponses = require('../../../responses/common.responses');

/**
 * ============================================================
 * PROMOTIONAL BANNER PATHS — CLIENT (PÚBLICO)
 * ============================================================
 * Módulo: /client/api/v1/core/promotional-banners (core, sin subdominio)
 * Banners promocionales de la landing pública y la app cliente.
 *
 * Endpoint público (sin autenticación, rate limit público estricto, patrón del
 * formulario de contacto). El mantenedor vive en el panel admin
 * (`/admin/api/v1/core/promotional-banners`).
 *
 * Rutas:
 *   GET /client/api/v1/core/promotional-banners
 */

// ─── Schemas ──────────────────────────────────────────────────

const schemas = {
  PublicPromotionalBannerItem: {
    type: 'object',
    description: 'Banner promocional publicado (vista pública: sin isActive ni sortOrder).',
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string', example: 'Descubre las novedades de Base Project' },
      text: { type: 'string', example: 'Explora las nuevas funciones y mejoras que trae Base Project para ti.' },
      tag: { type: 'string', nullable: true, example: 'Nuevo' },
      buttonRoute: { type: 'string', nullable: true, example: '/hub/inicio', description: 'Ruta interna del front a la que lleva el botón.' },
      buttonName: { type: 'string', nullable: true, example: 'Explorar', description: 'Texto visible del botón del banner.' },
      imageUrl: { type: 'string', nullable: true, example: 'https://cdn.base-project.com/banners/novedades.webp' }
    }
  },

  PublicPromotionalBannerListResponse: {
    type: 'object',
    properties: {
      banners: {
        type: 'array',
        description: 'Solo banners activos, ordenados por sortOrder ascendente.',
        items: { $ref: '#/components/schemas/PublicPromotionalBannerItem' }
      }
    }
  }
};

// ─── Paths ────────────────────────────────────────────────────

const paths = {
  '/client/api/v1/core/promotional-banners': {
    get: {
      tags: ['Banners Promocionales (Público)'],
      summary: 'Listar banners promocionales publicados',
      operationId: 'publicListPromotionalBanners',
      description:
        'Banners promocionales para la landing pública y la app cliente. **Público, sin autenticación** ' +
        '(rate limit público estricto anti-abuso). Devuelve solo los banners **activos**, ya ordenados por ' +
        '`sortOrder`; no expone `isActive` ni `sortOrder`. Sin banners publicados devuelve `banners: []`. ' +
        'Respuesta cacheada en el servidor (TTL 60 s): un cambio hecho por el admin se refleja a lo sumo un minuto después.',
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/PublicPromotionalBannerListResponse' },
          'Banners promocionales obtenidos exitosamente'
        ),
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  }
};

export = { paths, schemas };
