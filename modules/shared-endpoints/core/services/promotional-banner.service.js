const { SystemGlobalConfig } = require('../../../../shared/models');
const { logAudit } = require('../../../../shared/utils/logger.util');
const { PublicPromotionalBannerListDTO } = require('../dtos/promotional-banner.dto');

// Caché en memoria (TTL 60s, patrón del resolver de resiliencia): endpoint público sin auth, no
// puede pegarle a BD en cada request. Un cambio del admin se refleja a lo sumo 60s después.
const CACHE_TTL_MS = 60000;
let cache = { data: null, expiresAt: 0 };

class PromotionalBannerPublicService {
  /**
   * Banners activos para el front (landing pública + app cliente), ordenados por sortOrder.
   * Solo contenido publicado: los banners con is_active false nunca salen de acá.
   */
  async getActiveBanners() {
    if (cache.data && Date.now() < cache.expiresAt) {
      return cache.data;
    }

    const config = await SystemGlobalConfig.findOne({ where: { is_active: true } });
    const activos = (config?.promotional_banners ?? []).filter(b => b.is_active !== false);

    const dto = PublicPromotionalBannerListDTO(activos);
    cache = { data: dto, expiresAt: Date.now() + CACHE_TTL_MS };

    logAudit(
      'PROMOTIONAL_BANNERS_PUBLIC_VIEWED',
      null,
      { total: dto.banners.length },
      { entityType: 'SystemGlobalConfig', entityTable: 'system_global_config' }
    );

    return dto;
  }
}

module.exports = new PromotionalBannerPublicService();
