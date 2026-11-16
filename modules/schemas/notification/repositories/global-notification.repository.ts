import BaseRepository = require('../../../../shared/repositories/base.repository');
import modelsModule = require('../../../../shared/models');
const { GlobalNotification, GlobalNotificationRead } = modelsModule;
import sequelizeModule = require('sequelize');
const { Op } = sequelizeModule;
import type defineGlobalNotification = require('../models/global-notification.model');

class GlobalNotificationRepository extends BaseRepository<defineGlobalNotification.Instance> {
  constructor() {
    super(GlobalNotification);
  }

  /**
   * Obtiene notificaciones globales activas para mostrar a usuarios
   */
  findActiveNotifications() {
    const now = new Date();

    return this.findAll(
      {
        is_active: true,
        send_in_app: true,
        starts_at: { [Op.lte]: now },
        [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gt]: now } }]
      },
      {
        order: [['created_at', 'DESC']],
        include: [{ association: 'notification_type' }]
      }
    );
  }

  /**
   * Obtiene notificaciones activas que un usuario NO ha leído
   */
  async findUnreadByUser(userId: string) {
    const now = new Date();

    // Subquery para excluir las ya leídas
    const readIds = await GlobalNotificationRead.findAll({
      where: { user_id: userId },
      attributes: ['global_notification_id'],
      raw: true
    });

    const readIdsArray = readIds.map(r => r.global_notification_id);

    return this.findAll(
      {
        is_active: true,
        send_in_app: true,
        starts_at: { [Op.lte]: now },
        [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gt]: now } }],
        global_notification_id: {
          [Op.notIn]: readIdsArray.length > 0 ? readIdsArray : ['00000000-0000-0000-0000-000000000000']
        }
      },
      {
        order: [['created_at', 'DESC']],
        include: [{ association: 'notification_type' }]
      }
    );
  }

  /**
   * Marca una notificación global como leída para un usuario
   */
  async markAsReadByUser(globalNotificationId: string, userId: string) {
    const [record] = await GlobalNotificationRead.findOrCreate({
      where: {
        global_notification_id: globalNotificationId,
        user_id: userId
      },
      defaults: {
        global_notification_id: globalNotificationId,
        user_id: userId,
        read_at: new Date()
      }
    });

    return record;
  }

  /**
   * Obtiene notificaciones pendientes de procesar para push
   */
  findPendingPushProcessing() {
    return this.findAll({
      send_push: true,
      push_processing_status: 'pending',
      is_active: true
    });
  }

  /**
   * Obtiene notificaciones pendientes de procesar para email
   */
  findPendingEmailProcessing() {
    return this.findAll({
      send_email: true,
      email_processing_status: 'pending',
      is_active: true
    });
  }

  /**
   * Actualiza estado de procesamiento de push
   */
  updatePushProcessingStatus(
    globalNotificationId: string,
    status: defineGlobalNotification.Attributes['push_processing_status'],
    additionalData: Partial<defineGlobalNotification.Attributes> = {}
  ) {
    return this.update(globalNotificationId, {
      push_processing_status: status,
      ...additionalData
    });
  }

  /**
   * Actualiza estado de procesamiento de email
   */
  updateEmailProcessingStatus(
    globalNotificationId: string,
    status: defineGlobalNotification.Attributes['email_processing_status'],
    additionalData: Partial<defineGlobalNotification.Attributes> = {}
  ) {
    return this.update(globalNotificationId, {
      email_processing_status: status,
      ...additionalData
    });
  }

  /**
   * Incrementa contador de push enviados
   */
  incrementPushSentCount(globalNotificationId: string, amount = 1) {
    return this.model.increment('push_sent_count', {
      by: amount,
      where: { global_notification_id: globalNotificationId }
    });
  }

  /**
   * Incrementa contador de emails enviados
   */
  incrementEmailSentCount(globalNotificationId: string, amount = 1) {
    return this.model.increment('email_sent_count', {
      by: amount,
      where: { global_notification_id: globalNotificationId }
    });
  }

  /**
   * Obtiene estadísticas de una notificación global
   */
  async getStatistics(globalNotificationId: string) {
    const notification = await this.findById(globalNotificationId);
    if (!notification) {
      return null;
    }

    // Contar lecturas
    const readCount = await GlobalNotificationRead.count({
      where: { global_notification_id: globalNotificationId }
    });

    return {
      global_notification_id: globalNotificationId,
      total_target_users: notification.total_target_users,
      push_sent_count: notification.push_sent_count,
      email_sent_count: notification.email_sent_count,
      read_count: readCount,
      push_processing_status: notification.push_processing_status,
      email_processing_status: notification.email_processing_status,
      is_active: notification.is_active
    };
  }

  /**
   * Desactiva notificaciones expiradas
   */
  deactivateExpired() {
    const now = new Date();

    return this.bulkUpdate(
      { is_active: false },
      {
        is_active: true,
        ends_at: { [Op.lte]: now }
      }
    );
  }

  /**
   * Obtiene notificaciones creadas por un usuario
   */
  findByCreator(creatorId: string) {
    return this.findAll(
      { created_by: creatorId },
      {
        order: [['created_at', 'DESC']],
        include: [{ association: 'notification_type' }]
      }
    );
  }

  /**
   * Obtiene notificaciones por rol objetivo
   */
  findByTargetRole(role: string) {
    return this.findAll({ target_user_role: role, is_active: true }, { order: [['created_at', 'DESC']] });
  }
}

export = new GlobalNotificationRepository();
