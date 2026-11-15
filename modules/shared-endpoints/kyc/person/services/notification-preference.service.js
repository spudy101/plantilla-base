const unitOfWork = require('../../../../../shared/database/unit-of-work');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logAudit } = require('../../../../../shared/utils/logger.util');
// eslint-disable-next-line max-len
const userNotificationPreferenceRepository = require('../../../../schemas/kyc/person/repositories/user-notification-preference.repository');
const notificationCategoryRepository = require('../../../../schemas/notification/repositories/notification-category.repository');
const { UpdatePreferenceResponseDTO, CategoryPreferencesViewDTO } = require('../dtos/notification-preference.dto');
const { UserNotificationPreferenceComponent } = require('../../../../../shared/dtos/notification/components-notification.dto');

/** Extrae del body solo las keys de preferencia presentes (undefined => no se toca). */
function _pickPreferenceFields(data) {
  const fields = {};
  for (const key of ['allowPush', 'allowEmail', 'allowSms', 'quietHoursStart', 'quietHoursEnd']) {
    if (data[key] !== undefined) {
      fields[key] = data[key];
    }
  }
  return fields;
}

class NotificationPreferenceService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new NotificationPreferenceService({ unitOfWork: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.userNotificationPreferenceRepository = deps.userNotificationPreferenceRepository ?? userNotificationPreferenceRepository;
    this.notificationCategoryRepository = deps.notificationCategoryRepository ?? notificationCategoryRepository;
  }

  /**
   * Crea o actualiza la preferencia GLOBAL del usuario (categoría = null). Aplica a todas las
   * categorías que no tengan una preferencia específica.
   */
  async updateGlobalPreference(data, userId) {
    const updateData = _pickPreferenceFields(data);

    const transaction = await this.unitOfWork.begin();
    try {
      const preference = await this.userNotificationPreferenceRepository.upsertGlobalPreference(userId, updateData, {
        transaction
      });
      await transaction.commit();

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
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Crea o actualiza la preferencia del usuario para una CATEGORÍA concreta. Esta preferencia
   * pisa a la global para esa categoría. Rechaza categorías inexistentes/inactivas y valida que
   * la categoría permita silenciarse antes de aceptar quiet hours.
   */
  async updateCategoryPreference(categoryCode, data, userId) {
    const category = await this.notificationCategoryRepository.findByCode(categoryCode);
    if (!category || !category.is_active) {
      throw AppError.notFound('Categoría de notificación no encontrada');
    }

    const updateData = _pickPreferenceFields(data);

    const transaction = await this.unitOfWork.begin();
    try {
      const preference = await this.userNotificationPreferenceRepository.upsertCategoryPreference(
        userId,
        categoryCode,
        updateData,
        { transaction }
      );
      await transaction.commit();

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
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Elimina la preferencia específica de una categoría: el usuario vuelve a regirse por la global.
   */
  async deleteCategoryPreference(categoryCode, userId) {
    const category = await this.notificationCategoryRepository.findByCode(categoryCode);
    if (!category || !category.is_active) {
      throw AppError.notFound('Categoría de notificación no encontrada');
    }

    const transaction = await this.unitOfWork.begin();
    try {
      await this.userNotificationPreferenceRepository.deleteCategoryPreference(userId, categoryCode, { transaction });
      await transaction.commit();

      logAudit(
        'NOTIFICATION_CATEGORY_PREFERENCE_DELETED',
        userId,
        { notificationCategoryCode: categoryCode },
        { entityType: 'UserNotificationPreference', entityTable: 'user_notification_preferences' }
      );

      return { notificationCategoryCode: categoryCode };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Preferencias crudas almacenadas del usuario (global + overrides por categoría).
   */
  async getPreferences(userId) {
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
  async getCategoriesWithPreferences(userId) {
    const [categories, stored] = await Promise.all([
      this.notificationCategoryRepository.findAllActive(),
      this.userNotificationPreferenceRepository.findAllByUser(userId)
    ]);

    const global = stored.find(p => !p.notification_category_code) || null;
    const overrides = new Map(stored.filter(p => p.notification_category_code).map(p => [p.notification_category_code, p]));

    logAudit(
      'NOTIFICATION_PREFERENCES_VIEWED',
      userId,
      { totalItems: categories.length },
      { entityType: 'UserNotificationPreference', entityTable: 'user_notification_preferences' }
    );

    return CategoryPreferencesViewDTO.buildArray(categories, overrides, global);
  }
}

module.exports = new NotificationPreferenceService();
module.exports.NotificationPreferenceService = NotificationPreferenceService;
