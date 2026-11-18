import { z } from '../../../shared/validation/z';
import { NotificationCategorySchema } from './notification-components.response';
import type { PreferenceRow } from '../repositories/user-notification-preference.repository';
import type { NotificationCategoryRow } from '../repositories/notification-category.repository';
import componentsNotificationDtoModule from './notification-components.response';
const { UserNotificationPreferenceComponent, NotificationCategoryComponent } = componentsNotificationDtoModule;

type Preference = Pick<PreferenceRow, 'allowPush' | 'allowEmail' | 'allowSms' | 'quietHoursStart' | 'quietHoursEnd'>;
type PreferenceField = keyof Preference;
/** Categoría (lo que pide NotificationCategoryComponent + los flags de silencio). */
type Category = Parameters<typeof NotificationCategoryComponent.build>[0] &
  Pick<NotificationCategoryRow, 'code' | 'allowDnd' | 'isCritical'>;

/** Respuesta al crear/actualizar una preferencia (global o por categoría). */
class UpdatePreferenceResponseDTO {
  constructor(preference: Parameters<typeof UserNotificationPreferenceComponent.build>[0]) {
    Object.assign(this, UserNotificationPreferenceComponent.build(preference));
  }
}

/**
 * Vista de una categoría con la preferencia EFECTIVA del usuario ya resuelta:
 *   override de categoría → preferencia global → default (todos los canales permitidos, sin DND).
 *
 * `preference.source` indica de dónde salió el valor efectivo ('category' | 'global' | 'default'),
 * útil para que el front muestre "personalizado" vs "hereda de tu config global".
 */
class CategoryPreferencesViewDTO {
  static _resolve<K extends PreferenceField, F>(
    override: Preference | null,
    global: Preference | null,
    field: K,
    fallback: F
  ): { value: NonNullable<Preference[K]> | F; source: 'category' | 'global' | 'default' } {
    if (override && override[field] !== null && override[field] !== undefined) {
      return { value: override[field] as NonNullable<Preference[K]>, source: 'category' };
    }
    if (global && global[field] !== null && global[field] !== undefined) {
      return { value: global[field] as NonNullable<Preference[K]>, source: 'global' };
    }
    return { value: fallback, source: 'default' };
  }

  static build(category: Category, override: Preference | null = null, global: Preference | null = null) {
    const allowPush = CategoryPreferencesViewDTO._resolve(override, global, 'allowPush', true);
    const allowEmail = CategoryPreferencesViewDTO._resolve(override, global, 'allowEmail', true);
    const allowSms = CategoryPreferencesViewDTO._resolve(override, global, 'allowSms', true);
    const quietStart = CategoryPreferencesViewDTO._resolve(override, global, 'quietHoursStart', null);
    const quietEnd = CategoryPreferencesViewDTO._resolve(override, global, 'quietHoursEnd', null);

    // Fuente predominante de la preferencia efectiva: si hay override de categoría manda 'category',
    // si no pero hay global manda 'global', si no 'default'.
    let source: 'category' | 'global' | 'default' = 'default';
    if (override) {
      source = 'category';
    } else if (global) {
      source = 'global';
    }

    return {
      ...NotificationCategoryComponent.build(category),
      // silenciable = la categoría permite DND y no es crítica; si es false el front debe ocultar
      // los quiet hours (siempre se envía, ignora la config del usuario).
      isSilenceable: category.allowDnd === true && category.isCritical !== true,
      preference: {
        source,
        allowPush: allowPush.value,
        allowEmail: allowEmail.value,
        allowSms: allowSms.value,
        quietHoursStart: quietStart.value,
        quietHoursEnd: quietEnd.value
      }
    };
  }

  static buildArray(
    categories: readonly Category[] | null | undefined,
    overridesMap: Map<string, Preference>,
    global: Preference | null
  ) {
    if (!categories || categories.length === 0) {
      return [];
    }
    return categories.map(category =>
      CategoryPreferencesViewDTO.build(category, overridesMap.get(category.code) || null, global)
    );
  }
}

export default {
  // Alias retrocompatible: la respuesta global antes se llamaba UpdateGlobalPreferenceResponseDTO.
  UpdateGlobalPreferenceResponseDTO: UpdatePreferenceResponseDTO,
  UpdatePreferenceResponseDTO,
  CategoryPreferencesViewDTO
};

// ── Esquemas de salida ──
export const CategoryPreferenceViewSchema = NotificationCategorySchema.extend({
  isSilenceable: z.boolean().meta({ description: 'true si el usuario puede silenciarla (allowDnd y no crítica).' }),
  preference: z
    .object({
      source: z
        .enum(['category', 'global', 'default'])
        .meta({
          description: 'Origen de la preferencia efectiva: ajuste de la categoría, preferencia global o valor por defecto.'
        }),
      allowPush: z.boolean(),
      allowEmail: z.boolean(),
      allowSms: z.boolean(),
      quietHoursStart: z.string().nullable().meta({ example: '22:00:00' }),
      quietHoursEnd: z.string().nullable().meta({ example: '07:00:00' })
    })
    .meta({ description: 'Preferencia efectiva para esta categoría.' })
});

export const PreferenceDeletedSchema = z.object({ notificationCategoryCode: z.string() });
