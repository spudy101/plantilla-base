// DTOs del mantenedor admin de banners promocionales. El JSONB se persiste en snake_case
// (convención de JSONB propios) → salida camelCase campo a campo, nunca el objeto crudo.

function _banner(b) {
  return {
    id: b.id,
    title: b.title,
    text: b.text,
    tag: b.tag ?? null,
    buttonRoute: b.button_route ?? null,
    buttonName: b.button_name ?? null,
    imageUrl: b.image_url ?? null,
    isActive: b.is_active !== false,
    sortOrder: b.sort_order ?? null
  };
}

function PromotionalBannerListDTO(banners) {
  const items = (Array.isArray(banners) ? banners : []).map(b => _banner(b));
  items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return { banners: items };
}

function PromotionalBannerImageDTO(imageUrl, s3Key) {
  return { imageUrl, s3Key };
}

module.exports = { PromotionalBannerListDTO, PromotionalBannerImageDTO };
