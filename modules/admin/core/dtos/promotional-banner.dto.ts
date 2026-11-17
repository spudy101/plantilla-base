// DTOs del mantenedor admin de banners promocionales. El JSONB se persiste en snake_case
// (convención de JSONB propios) → salida camelCase campo a campo, nunca el objeto crudo.

/** Banner tal como se guarda en system_global_configs.promotional_banners (JSONB, snake_case). */
interface StoredBanner {
  id: string;
  title: string;
  text: string;
  tag?: string | null;
  button_route?: string | null;
  button_name?: string | null;
  image_url?: string | null;
  is_active?: boolean;
  sort_order?: number | null;
}

function _banner(b: StoredBanner) {
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

function PromotionalBannerListDTO(banners: readonly StoredBanner[] | null | undefined) {
  const items = (Array.isArray(banners) ? banners : []).map(b => _banner(b));
  items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return { banners: items };
}

function PromotionalBannerImageDTO(imageUrl: string, s3Key: string) {
  return { imageUrl, s3Key };
}

const PromotionalBannerAdminDto = { PromotionalBannerListDTO, PromotionalBannerImageDTO };

// eslint-disable-next-line @typescript-eslint/no-namespace, @typescript-eslint/no-redeclare
declare namespace PromotionalBannerAdminDto {
  type Stored = StoredBanner;
}

export default PromotionalBannerAdminDto;
