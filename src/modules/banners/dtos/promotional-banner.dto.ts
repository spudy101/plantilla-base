// DTO público de banners promocionales. El JSONB se persiste en snake_case (convención de JSONB
// propios) → salida camelCase campo a campo. No expone isActive ni sortOrder: el público solo ve
// contenido publicado, ya ordenado.

/** Banner tal como se guarda en el JSONB (snake_case). */
interface BannerRow {
  id: string;
  title: string;
  text: string;
  tag?: string | null;
  button_route?: string | null;
  button_name?: string | null;
  image_url?: string | null;
  sort_order?: number | null;
  is_active?: boolean;
}

function _banner(b: BannerRow) {
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

function PublicPromotionalBannerListDTO(banners: readonly BannerRow[] | null | undefined) {
  const items = [...(Array.isArray(banners) ? banners : [])];
  items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return { banners: items.map(b => _banner(b)) };
}

// eslint-disable-next-line @typescript-eslint/no-namespace, @typescript-eslint/no-redeclare
declare namespace PromotionalBannerDto {
  type Banner = BannerRow;
}

const PromotionalBannerDto = { PublicPromotionalBannerListDTO };

export default PromotionalBannerDto;
