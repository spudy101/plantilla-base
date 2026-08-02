const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { UserNotificationPreference } = require('../../../../../shared/models');
const requestContext = require('../../../../../shared/utils/request-context.util');
const { Op } = require('sequelize');

/**
 * Mapea las keys camelCase del DTO de entrada a las columnas snake_case del modelo.
 * Solo incluye los campos presentes (undefined => no se toca la columna).
 */
function _toColumns(data = {}) {
  const columns = {};
  if (data.allowPush !== undefined) {
    columns.allow_push = data.allowPush;
  }
  if (data.allowEmail !== undefined) {
    columns.allow_email = data.allowEmail;
  }
  if (data.allowSms !== undefined) {
    columns.allow_sms = data.allowSms;
  }
  if (data.quietHoursStart !== undefined) {
    columns.quiet_hours_start = data.quietHoursStart;
  }
  if (data.quietHoursEnd !== undefined) {
    columns.quiet_hours_end = data.quietHoursEnd;
  }
  return columns;
}

class UserNotificationPreferenceRepository extends BaseRepository {
  constructor() {
    super(UserNotificationPreference);
  }

  /**
   * Busca la preferencia del usuario para una categoría específica.
   * Primero busca la preferencia de esa categoría; si no existe, cae a la global (code = null).
   */
  async findByUserAndCategory(userId, notificationCategoryCode) {
    const specific = await this.findOne({
      user_id: userId,
      notification_category_code: notificationCategoryCode
    });

    if (specific) {
      return specific;
    }

    return this.findOne({
      user_id: userId,
      notification_category_code: null
    });
  }

  /**
   * Obtiene la preferencia global del usuario
   */
  findGlobalByUser(userId) {
    return this.findOne({
      user_id: userId,
      notification_category_code: null
    });
  }

  /**
   * Obtiene todas las preferencias de un usuario (global + por categoría)
   */
  findAllByUser(userId) {
    return this.findAll(
      { user_id: userId },
      {
        order: [['notification_category_code', 'ASC']],
        include: [{ association: 'notification_category' }]
      }
    );
  }

  /**
   * Crea o actualiza la preferencia global del usuario
   */
  async upsertGlobalPreference(userId, data, options = {}) {
    const columns = _toColumns(data);
    const existing = await this.findGlobalByUser(userId);

    if (existing) {
      return existing.update(columns, options);
    }

    return this.create(
      {
        user_id: userId,
        notification_category_code: null,
        ...columns,
        ...requestContext.originFromContext()
      },
      options
    );
  }

  /**
   * Crea o actualiza la preferencia de una categoría
   */
  async upsertCategoryPreference(userId, notificationCategoryCode, data, options = {}) {
    const columns = _toColumns(data);
    const existing = await this.findOne({
      user_id: userId,
      notification_category_code: notificationCategoryCode
    });

    if (existing) {
      return existing.update(columns, options);
    }

    return this.create(
      {
        user_id: userId,
        notification_category_code: notificationCategoryCode,
        ...columns,
        ...requestContext.originFromContext()
      },
      options
    );
  }

  /**
   * Elimina la preferencia de una categoría (vuelve a usar la global)
   */
  deleteCategoryPreference(userId, notificationCategoryCode, options = {}) {
    return this.bulkDelete(
      {
        user_id: userId,
        notification_category_code: notificationCategoryCode
      },
      options
    );
  }

  /**
   * Verifica si el usuario permite push para una categoría
   */
  async userAllowsPush(userId, notificationCategoryCode) {
    const preference = await this.findByUserAndCategory(userId, notificationCategoryCode);
    return preference?.allow_push ?? true;
  }

  /**
   * Verifica si el usuario permite email para una categoría
   */
  async userAllowsEmail(userId, notificationCategoryCode) {
    const preference = await this.findByUserAndCategory(userId, notificationCategoryCode);
    return preference?.allow_email ?? true;
  }

  /**
   * Verifica si el usuario permite SMS para una categoría
   */
  async userAllowsSms(userId, notificationCategoryCode) {
    const preference = await this.findByUserAndCategory(userId, notificationCategoryCode);
    return preference?.allow_sms ?? true;
  }

  /**
   * Obtiene usuarios que permiten push para una categoría
   */
  findUsersAllowingPush(notificationCategoryCode, userIds = null) {
    const where = {
      [Op.or]: [
        { notification_category_code: notificationCategoryCode, allow_push: true },
        { notification_category_code: null, allow_push: true }
      ]
    };

    if (userIds) {
      where.user_id = { [Op.in]: userIds };
    }

    return this.findAll(where);
  }

  /**
   * Obtiene usuarios que permiten email para una categoría
   */
  findUsersAllowingEmail(notificationCategoryCode, userIds = null) {
    const where = {
      [Op.or]: [
        { notification_category_code: notificationCategoryCode, allow_email: true },
        { notification_category_code: null, allow_email: true }
      ]
    };

    if (userIds) {
      where.user_id = { [Op.in]: userIds };
    }

    return this.findAll(where);
  }
}

module.exports = new UserNotificationPreferenceRepository();
