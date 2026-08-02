// DTO público de banners promocionales. El JSONB se persiste en snake_case (convención de JSONB
// propios) → salida camelCase campo a campo. No expone isActive ni sortOrder: el público solo ve
// contenido publicado, ya ordenado.

function _banner(b) {
  return {
    id: b.id,
    title: b.title,
    text: b.text,
    tag: b.tag ?? null,
    buttonRoute: b.button_route ?? null,
    buttonName: b.button_name ?? null,
    imageUrl: b.image_url ?? null
  };
}

function PublicPromotionalBannerListDTO(banners) {
  const items = [...(Array.isArray(banners) ? banners : [])];
  items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return { banners: items.map(b => _banner(b)) };
}

module.exports = { PublicPromotionalBannerListDTO };
