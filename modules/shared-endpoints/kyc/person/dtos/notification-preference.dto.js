const {
  UserNotificationPreferenceComponent,
  NotificationCategoryComponent
} = require('../../../../../shared/dtos/notification/components-notification.dto');

/** Respuesta al crear/actualizar una preferencia (global o por categoría). */
class UpdatePreferenceResponseDTO {
  constructor(preference) {
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
  static _resolve(override, global, field, fallback) {
    if (override && override[field] !== null && override[field] !== undefined) {
      return { value: override[field], source: 'category' };
    }
    if (global && global[field] !== null && global[field] !== undefined) {
      return { value: global[field], source: 'global' };
    }
    return { value: fallback, source: 'default' };
  }

  static build(category, override = null, global = null) {
    const allowPush = CategoryPreferencesViewDTO._resolve(override, global, 'allow_push', true);
    const allowEmail = CategoryPreferencesViewDTO._resolve(override, global, 'allow_email', true);
    const allowSms = CategoryPreferencesViewDTO._resolve(override, global, 'allow_sms', true);
    const quietStart = CategoryPreferencesViewDTO._resolve(override, global, 'quiet_hours_start', null);
    const quietEnd = CategoryPreferencesViewDTO._resolve(override, global, 'quiet_hours_end', null);

    // Fuente predominante de la preferencia efectiva: si hay override de categoría manda 'category',
    // si no pero hay global manda 'global', si no 'default'.
    let source = 'default';
    if (override) {
      source = 'category';
    } else if (global) {
      source = 'global';
    }

    return {
      ...NotificationCategoryComponent.build(category),
      // silenciable = la categoría permite DND y no es crítica; si es false el front debe ocultar
      // los quiet hours (siempre se envía, ignora la config del usuario).
      isSilenceable: category.allow_dnd === true && category.is_critical !== true,
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

  static buildArray(categories, overridesMap, global) {
    if (!categories || categories.length === 0) {
      return [];
    }
    return categories.map(category =>
      CategoryPreferencesViewDTO.build(category, overridesMap.get(category.code) || null, global)
    );
  }
}

module.exports = {
  // Alias retrocompatible: la respuesta global antes se llamaba UpdateGlobalPreferenceResponseDTO.
  UpdateGlobalPreferenceResponseDTO: UpdatePreferenceResponseDTO,
  UpdatePreferenceResponseDTO,
  CategoryPreferencesViewDTO
};
