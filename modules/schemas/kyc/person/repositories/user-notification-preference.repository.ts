import BaseRepository from '../../../../../shared/repositories/base.repository';
import modelsModule from '../../../../../shared/models';
const { UserNotificationPreference } = modelsModule;
import requestContext from '../../../../../shared/utils/request-context.util';
import { Op } from 'sequelize';
import * as queryModule from '../../../../../shared/repositories/query';
const { toWhere } = queryModule;
import type { WhereClause } from '../../../../../shared/repositories/query';
import type { CreateOptions, DestroyOptions } from 'sequelize';
import type defineUserNotificationPreference from '../models/user-notification-preference.model';

/** Preferencias tal como llegan del DTO de entrada (camelCase). */
interface PreferenceInput {
  allowPush?: boolean;
  allowEmail?: boolean;
  allowSms?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
}

/**
 * Mapea las keys camelCase del DTO de entrada a las columnas snake_case del modelo.
 * Solo incluye los campos presentes (undefined => no se toca la columna).
 */
function _toColumns(data: PreferenceInput = {}) {
  const columns: Partial<defineUserNotificationPreference.Attributes> = {};
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

class UserNotificationPreferenceRepository extends BaseRepository<defineUserNotificationPreference.Instance> {
  constructor() {
    super(UserNotificationPreference);
  }

  /**
   * Busca la preferencia del usuario para una categoría específica.
   * Primero busca la preferencia de esa categoría; si no existe, cae a la global (code = null).
   */
  async findByUserAndCategory(userId: string, notificationCategoryCode: string | null) {
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
  findGlobalByUser(userId: string) {
    return this.findOne({
      user_id: userId,
      notification_category_code: null
    });
  }

  /**
   * Obtiene todas las preferencias de un usuario (global + por categoría)
   */
  findAllByUser(userId: string) {
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
  async upsertGlobalPreference(userId: string, data: PreferenceInput, options: CreateOptions<defineUserNotificationPreference.Attributes> = {}) {
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
  async upsertCategoryPreference(
    userId: string,
    notificationCategoryCode: string,
    data: PreferenceInput,
    options: CreateOptions<defineUserNotificationPreference.Attributes> = {}
  ) {
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
  deleteCategoryPreference(
    userId: string,
    notificationCategoryCode: string,
    options: Omit<DestroyOptions<defineUserNotificationPreference.Attributes>, 'where'> = {}
  ) {
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
  async userAllowsPush(userId: string, notificationCategoryCode: string | null) {
    const preference = await this.findByUserAndCategory(userId, notificationCategoryCode);
    return preference?.allow_push ?? true;
  }

  /**
   * Verifica si el usuario permite email para una categoría
   */
  async userAllowsEmail(userId: string, notificationCategoryCode: string | null) {
    const preference = await this.findByUserAndCategory(userId, notificationCategoryCode);
    return preference?.allow_email ?? true;
  }

  /**
   * Verifica si el usuario permite SMS para una categoría
   */
  async userAllowsSms(userId: string, notificationCategoryCode: string | null) {
    const preference = await this.findByUserAndCategory(userId, notificationCategoryCode);
    return preference?.allow_sms ?? true;
  }

  /**
   * Obtiene usuarios que permiten push para una categoría
   */
  findUsersAllowingPush(notificationCategoryCode: string | null, userIds: string[] | null = null) {
    const where: WhereClause = {
      [Op.or]: [
        { notification_category_code: notificationCategoryCode, allow_push: true },
        { notification_category_code: null, allow_push: true }
      ]
    };

    if (userIds) {
      where.user_id = { [Op.in]: userIds };
    }

    return this.findAll(toWhere(where));
  }

  /**
   * Obtiene usuarios que permiten email para una categoría
   */
  findUsersAllowingEmail(notificationCategoryCode: string | null, userIds: string[] | null = null) {
    const where: WhereClause = {
      [Op.or]: [
        { notification_category_code: notificationCategoryCode, allow_email: true },
        { notification_category_code: null, allow_email: true }
      ]
    };

    if (userIds) {
      where.user_id = { [Op.in]: userIds };
    }

    return this.findAll(toWhere(where));
  }
}

export default new UserNotificationPreferenceRepository();
