import unitOfWork from '../../../../../shared/database/unit-of-work';
import AppError from '../../../../../shared/utils/app-error.util';
import loggerUtilModule from '../../../../../shared/utils/logger.util';
const { logAudit } = loggerUtilModule;
// eslint-disable-next-line max-len
import userNotificationPreferenceRepository from '../../../../schemas/kyc/person/repositories/user-notification-preference.repository';
import notificationCategoryRepository from '../../../../schemas/notification/repositories/notification-category.repository';
import notificationPreferenceDtoModule from '../dtos/notification-preference.dto';
const { UpdatePreferenceResponseDTO, CategoryPreferencesViewDTO } = notificationPreferenceDtoModule;
import componentsNotificationDtoModule from '../../../../../shared/dtos/notification/components-notification.dto';
const { UserNotificationPreferenceComponent } = componentsNotificationDtoModule;

/** Extrae del body solo las keys de preferencia presentes (undefined => no se toca). */
/** Preferencias tal como llegan del body (camelCase). */
interface PreferenceInput {
  allowPush?: boolean;
  allowEmail?: boolean;
  allowSms?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
}

const PREFERENCE_KEYS = ['allowPush', 'allowEmail', 'allowSms', 'quietHoursStart', 'quietHoursEnd'] as const;

function _pickPreferenceFields(data: PreferenceInput): PreferenceInput {
  const fields: Record<string, unknown> = {};
  for (const key of PREFERENCE_KEYS) {
    if (data[key] !== undefined) {
      fields[key] = data[key];
    }
  }
  return fields as PreferenceInput;
}

class NotificationPreferenceService {
  unitOfWork: typeof unitOfWork;
  userNotificationPreferenceRepository: typeof userNotificationPreferenceRepository;
  notificationCategoryRepository: typeof notificationCategoryRepository;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new NotificationPreferenceService({ unitOfWork: fake })
   * @param {object} [deps]
   */
  constructor(deps: NotificationPreferenceService.Deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.userNotificationPreferenceRepository = deps.userNotificationPreferenceRepository ?? userNotificationPreferenceRepository;
    this.notificationCategoryRepository = deps.notificationCategoryRepository ?? notificationCategoryRepository;
  }

  /**
   * Crea o actualiza la preferencia GLOBAL del usuario (categoría = null). Aplica a todas las
   * categorías que no tengan una preferencia específica.
   */
  async updateGlobalPreference(data: PreferenceInput, userId: string) {
    const updateData = _pickPreferenceFields(data);

    const preference = await this.unitOfWork.run(async transaction => {
      const preference = await this.userNotificationPreferenceRepository.upsertGlobalPreference(userId, updateData, {
        transaction
      });
      return preference;
    });

    logAudit(
      'NOTIFICATION_GLOBAL_PREFERENCE_UPDATED',
      userId,
      { ...updateData },
      {
        entityId: preference.user_notification_preference_id,
        entityType: 'UserNotificationPreference',
        entityTable: 'user_notification_preferences'
      }
    );

    return new UpdatePreferenceResponseDTO(preference);
  }

  /**
   * Crea o actualiza la preferencia del usuario para una CATEGORÍA concreta. Esta preferencia
   * pisa a la global para esa categoría. Rechaza categorías inexistentes/inactivas y valida que
   * la categoría permita silenciarse antes de aceptar quiet hours.
   */
  async updateCategoryPreference(categoryCode: string, data: PreferenceInput, userId: string) {
    const category = await this.notificationCategoryRepository.findByCode(categoryCode);
    if (!category || !category.is_active) {
      throw AppError.notFound('Categoría de notificación no encontrada');
    }

    const updateData = _pickPreferenceFields(data);

    const preference = await this.unitOfWork.run(async transaction => {
      const preference = await this.userNotificationPreferenceRepository.upsertCategoryPreference(
        userId,
        categoryCode,
        updateData,
        { transaction }
      );
      return preference;
    });

    logAudit(
      'NOTIFICATION_CATEGORY_PREFERENCE_UPDATED',
      userId,
      { notificationCategoryCode: categoryCode, ...updateData },
      {
        entityId: preference.user_notification_preference_id,
        entityType: 'UserNotificationPreference',
        entityTable: 'user_notification_preferences'
      }
    );

    return new UpdatePreferenceResponseDTO(preference);
  }

  /**
   * Elimina la preferencia específica de una categoría: el usuario vuelve a regirse por la global.
   */
  async deleteCategoryPreference(categoryCode: string, userId: string) {
    const category = await this.notificationCategoryRepository.findByCode(categoryCode);
    if (!category || !category.is_active) {
      throw AppError.notFound('Categoría de notificación no encontrada');
    }

    await this.unitOfWork.run(async transaction => {
      await this.userNotificationPreferenceRepository.deleteCategoryPreference(userId, categoryCode, { transaction });
    });

    logAudit(
      'NOTIFICATION_CATEGORY_PREFERENCE_DELETED',
      userId,
      { notificationCategoryCode: categoryCode },
      { entityType: 'UserNotificationPreference', entityTable: 'user_notification_preferences' }
    );

    return { notificationCategoryCode: categoryCode };
  }

  /**
   * Preferencias crudas almacenadas del usuario (global + overrides por categoría).
   */
  async getPreferences(userId: string) {
    const preferences = await this.userNotificationPreferenceRepository.findAllByUser(userId);

    logAudit(
      'NOTIFICATION_PREFERENCES_VIEWED',
      userId,
      { totalItems: preferences.length },
      { entityType: 'UserNotificationPreference', entityTable: 'user_notification_preferences' }
    );

    return UserNotificationPreferenceComponent.buildArray(preferences);
  }

  /**
   * Vista lista para pintar la pantalla de preferencias: cada categoría activa con su preferencia
   * EFECTIVA ya resuelta (override de categoría → global → default). Incluye los canales que soporta
   * la categoría y si es silenciable, para que el front sepa qué toggles mostrar.
   */
  async getCategoriesWithPreferences(userId: string) {
    const [categories, stored] = await Promise.all([
      this.notificationCategoryRepository.findAllActive(),
      this.userNotificationPreferenceRepository.findAllByUser(userId)
    ]);

    const global = stored.find(p => !p.notification_category_code) || null;
    const overrides = new Map(stored.flatMap(p => (p.notification_category_code ? [[p.notification_category_code, p] as const] : [])));

    logAudit(
      'NOTIFICATION_PREFERENCES_VIEWED',
      userId,
      { totalItems: categories.length },
      { entityType: 'UserNotificationPreference', entityTable: 'user_notification_preferences' }
    );

    return CategoryPreferencesViewDTO.buildArray(categories, overrides, global);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace NotificationPreferenceService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    unitOfWork?: typeof unitOfWork;
    userNotificationPreferenceRepository?: typeof userNotificationPreferenceRepository;
    notificationCategoryRepository?: typeof notificationCategoryRepository;
  }
}

export default Object.assign(new NotificationPreferenceService(), { NotificationPreferenceService });
