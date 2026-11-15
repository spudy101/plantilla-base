const { v4: uuidv4 } = require('uuid');
const AppError = require('../../../../shared/utils/app-error.util');
const { logAudit, logger } = require('../../../../shared/utils/logger.util');
const S3Util = require('../../../../shared/utils/s3.util');
const systemGlobalConfigRepository = require('../../../schemas/core/repositories/system-global-config.repository');
const { PromotionalBannerListDTO, PromotionalBannerImageDTO } = require('../dtos/promotional-banner.dto');

// Prefijo del bucket PÚBLICO (CloudFront). Cada imagen sube con key única (uuid), así que no hay
// caché vieja que invalidar: la URL nueva se referencia desde el JSON del banner.
const IMAGE_S3_PREFIX = 'promotional/banners';

const ENTITY_META = { entityType: 'SystemGlobalConfig', entityTable: 'system_global_config' };

class PromotionalBannerService {
  /**
   * Dependencias inyectables (SOLID: D).
   * @param {object} [deps]
   * @param {object} [deps.systemGlobalConfigRepository] - acceso a la config global
   * @param {object} [deps.fileStorage] - almacenamiento de archivos (por defecto S3)
   */
  constructor(deps = {}) {
    this.systemGlobalConfigRepository = deps.systemGlobalConfigRepository ?? systemGlobalConfigRepository;
    this.fileStorage = deps.fileStorage ?? S3Util;
  }

  async list(adminUserId) {
    const config = await this._getActiveConfig();

    logAudit('PROMOTIONAL_BANNERS_VIEWED_ADMIN', adminUserId, {}, { entityId: config.config_id, ...ENTITY_META });

    return PromotionalBannerListDTO(config.promotional_banners ?? []);
  }

  /**
   * Reemplaza el catálogo completo de banners (PUT): el panel admin manda el array final. Los ids
   * se conservan si vienen y se generan si no. Persistencia snake_case (convención JSONB) — la
   * conversión de/hacia camelCase vive acá y en el DTO, nunca se asigna el JSONB crudo.
   */
  async replace(banners, adminUserId) {
    const config = await this._getActiveConfig();
    const previousBanners = config.promotional_banners ?? [];

    const normalized = banners.map((b, index) => ({
      id: b.id ?? uuidv4(),
      title: b.title,
      text: b.text,
      tag: b.tag ?? null,
      button_route: b.buttonRoute ?? null,
      button_name: b.buttonName ?? null,
      image_url: b.imageUrl ?? null,
      is_active: b.isActive ?? true,
      sort_order: b.sortOrder ?? index + 1
    }));

    const updated = await config.update({
      promotional_banners: normalized,
      config_version: config.config_version + 1
    });

    // El catálogo ya se persistió: recién ahí borramos de S3 las imágenes que ningún banner
    // referencia más (best-effort — un fallo de S3 no revierte el reemplazo).
    const cleanup = await this._cleanupOrphanImages(previousBanners, normalized);

    logAudit(
      'PROMOTIONAL_BANNERS_UPDATED',
      adminUserId,
      { total: normalized.length, active: normalized.filter(b => b.is_active).length, imagesRemoved: cleanup.deleted },
      { entityId: config.config_id, ...ENTITY_META }
    );

    return PromotionalBannerListDTO(updated.promotional_banners ?? []);
  }

  /**
   * Sube la imagen de un banner al bucket PÚBLICO (URL CloudFront estable y cacheable — contenido
   * público, no aplica presignar). Devuelve la URL para referenciarla en el PUT del catálogo.
   */
  async uploadImage(file, adminUserId) {
    if (!file?.buffer) {
      throw AppError.badRequest('La imagen del banner es requerida (campo multipart "image")');
    }

    const extension = (file.mimetype?.split('/')[1] ?? 'png').replace('jpeg', 'jpg');
    const s3Key = `${IMAGE_S3_PREFIX}/${uuidv4()}.${extension}`;

    const imageUrl = await this.fileStorage.uploadPublicDocument(file.buffer, s3Key, file.mimetype);

    logAudit('PROMOTIONAL_BANNER_IMAGE_UPLOADED', adminUserId, { s3Key }, ENTITY_META);

    return PromotionalBannerImageDTO(imageUrl, s3Key);
  }

  /**
   * Borra del bucket PÚBLICO las imágenes que dejaron de estar referenciadas por algún banner
   * (huérfanas tras el reemplazo del catálogo). Solo toca las que subió este mantenedor (viven
   * bajo IMAGE_S3_PREFIX); URLs externas (assets de marca, etc.) se ignoran. Best-effort: nunca
   * lanza — el catálogo ya quedó persistido y una imagen huérfana no debe romper el PUT.
   * @private
   */
  async _cleanupOrphanImages(previous, next) {
    const keptUrls = new Set(next.map(b => b.image_url).filter(Boolean));
    const orphanKeys = [
      ...new Set(
        (Array.isArray(previous) ? previous : [])
          .map(b => b?.image_url)
          .filter(url => url && !keptUrls.has(url))
          .map(url => this._managedImageKey(url))
          .filter(Boolean)
      )
    ];

    if (!orphanKeys.length) {
      return { deleted: 0, orphanKeys: [] };
    }

    const results = await Promise.allSettled(orphanKeys.map(key => this.fileStorage.deletePublicFile(key)));
    const deleted = results.filter(r => r.status === 'fulfilled').length;

    if (deleted < orphanKeys.length) {
      logger.warn('Limpieza de imágenes de banner: algunas imágenes huérfanas no se pudieron borrar', {
        orphanKeys,
        deleted,
        failed: orphanKeys.length - deleted
      });
    }

    return { deleted, orphanKeys };
  }

  /**
   * S3 key de una imagen SOLO si vive bajo el prefijo gestionado por este mantenedor (las que
   * suben por uploadImage). URLs externas (marca, terceros) o malformadas → null: no se borran.
   * @private
   */
  _managedImageKey(imageUrl) {
    try {
      const key = new URL(imageUrl).pathname.replace(/^\/+/, '');
      return key.startsWith(`${IMAGE_S3_PREFIX}/`) ? key : null;
    } catch {
      return null;
    }
  }

  /** @private */
  async _getActiveConfig() {
    const config = await this.systemGlobalConfigRepository.findActive();
    if (!config) {
      throw AppError.notFound('No hay una configuración global activa. Contacta al equipo de infraestructura.');
    }
    return config;
  }
}

module.exports = new PromotionalBannerService();
module.exports.PromotionalBannerService = PromotionalBannerService;
