import BaseRepository from '../../../../shared/repositories/base.repository';
import modelsModule from '../../../../shared/models';
const { GlobalNotificationRead } = modelsModule;
import requestContext from '../../../../shared/utils/request-context.util';
import { Op } from 'sequelize';
import type defineGlobalNotificationRead from '../models/global-notification-read.model';

class GlobalNotificationReadRepository extends BaseRepository<defineGlobalNotificationRead.Instance> {
  constructor() {
    super(GlobalNotificationRead);
  }

  /**
   * Marca una notificación global como leída para un usuario
   * @param {string} globalNotificationId
   * @param {string} userId
   * @returns {Promise<GlobalNotificationRead>}
   */
  async markAsRead(globalNotificationId: string, userId: string) {
    const [record] = await this.model.findOrCreate({
      where: {
        global_notification_id: globalNotificationId,
        user_id: userId
      },
      defaults: {
        global_notification_id: globalNotificationId,
        user_id: userId,
        read_at: new Date(),
        // `defaults` solo se aplica cuando findOrCreate CREA: una segunda marca de lectura no lo pisa.
        ...requestContext.originFromContext()
      }
    });

    return record;
  }

  /**
   * Marca múltiples notificaciones globales como leídas para un usuario
   * @param {Array<string>} globalNotificationIds
   * @param {string} userId
   * @returns {Promise<Array>}
   */
  bulkMarkAsRead(globalNotificationIds: string[], userId: string) {
    if (!globalNotificationIds || globalNotificationIds.length === 0) {
      return [];
    }

    const origin = requestContext.originFromContext();
    const records = globalNotificationIds.map((globalNotificationId: string) => ({
      global_notification_id: globalNotificationId,
      user_id: userId,
      read_at: new Date(),
      ...origin
    }));

    // bulkCreate con ignoreDuplicates para evitar errores si ya existe
    return this.bulkCreate(records, {
      ignoreDuplicates: true
    });
  }

  /**
   * Verifica si un usuario ha leído una notificación global
   * @param {string} globalNotificationId
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async hasUserRead(globalNotificationId: string, userId: string) {
    const count = await this.count({
      global_notification_id: globalNotificationId,
      user_id: userId
    });

    return count > 0;
  }

  /**
   * Obtiene todas las notificaciones globales leídas por un usuario
   * @param {string} userId
   * @returns {Promise<Array<string>>} Array de global_notification_ids
   */
  async getReadIdsByUser(userId: string) {
    const records = await this.findAll({ user_id: userId }, { attributes: ['global_notification_id'], raw: true });

    return records.map(r => r.global_notification_id);
  }

  /**
   * Cuenta cuántos usuarios han leído una notificación global
   * @param {string} globalNotificationId
   * @returns {Promise<number>}
   */
  countReaders(globalNotificationId: string) {
    return this.count({ global_notification_id: globalNotificationId });
  }

  /**
   * Elimina registros de lectura de notificaciones globales antiguas (limpieza)
   * @param {number} daysOld - Días de antigüedad
   * @returns {Promise<number>} Cantidad eliminada
   */
  deleteOldReads(daysOld = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return this.bulkDelete({
      read_at: { [Op.lt]: cutoffDate }
    });
  }
}

export default new GlobalNotificationReadRepository();
