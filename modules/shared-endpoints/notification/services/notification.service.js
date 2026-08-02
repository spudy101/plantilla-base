const { Op } = require('sequelize');
const { sequelize } = require('../../../../shared/models');
const { logger, logAudit } = require('../../../../shared/utils/logger.util');
const PaginationHelper = require('../../../../shared/utils/pagination.util');
const notificationRepository = require('../../../schemas/notification/repositories/notification.repository');
const globalNotificationRepository = require('../../../schemas/notification/repositories/global-notification.repository');
// eslint-disable-next-line max-len -- ruta de require de una sola línea; Prettier no la parte
const globalNotificationReadRepository = require('../../../schemas/notification/repositories/global-notification-read.repository');
const notificationCreationService = require('../../../schemas/notification/services/notification-creation.service');
const NotificationEmitter = require('../../../schemas/notification/utils/notification-emitter.util');
const NotificationCountUtil = require('../../../schemas/notification/utils/notification-count.util');

class NotificationService {
  // ── Públicos ───────────────────────────────────────────────────────────────

  async getNotificationsList(userId, query) {
    const paginationParams = PaginationHelper.getPaginationParams(query);

    const [personal, { rows: globalTagged, readIds }] = await Promise.all([
      this._getPersonalRaw(userId),
      this._getGlobalRaw(userId)
    ]);

    const mixed = this._mergeAndSort(personal, globalTagged, paginationParams.sortBy, paginationParams.order);
    const totalItems = mixed.length;

    const paginatedMixed = mixed.slice(paginationParams.offset, paginationParams.offset + paginationParams.limit);

    await this._markPageAsRead(userId, paginatedMixed, readIds);

    logAudit(
      'NOTIFICATION_LIST_VIEWED',
      userId,
      { totalItems, page: paginationParams.page },
      { entityType: 'Notification', entityTable: 'notifications' }
    );

    return { personal, global: globalTagged, mixed: paginatedMixed, readIds, totalItems, paginationParams };
  }

  async getPersonalNotifications(userId, query) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const searchTerm = query.search || null;
    const searchConfig = searchTerm ? { searchTerm, searchFields: ['title', 'body'] } : {};
    const { rows, count } = await notificationRepository.findByUserPaginated(userId, paginationParams, searchConfig);

    const unreadIds = rows.filter(n => !n.is_read).map(n => n.notification_id);
    await this._markPersonalAsRead(unreadIds);
    if (unreadIds.length > 0) {
      setImmediate(() => NotificationCountUtil.emitCountUpdate(userId));
    }

    logAudit(
      'NOTIFICATION_PERSONAL_LIST_VIEWED',
      userId,
      { totalItems: count, page: paginationParams.page },
      { entityType: 'Notification', entityTable: 'notifications' }
    );

    return { rows, count, paginationParams };
  }

  async getGlobalNotifications(userId, query) {
    const paginationParams = PaginationHelper.getPaginationParams(query);

    const { rows, readIds } = await this._getGlobalRaw(userId);
    const totalItems = rows.length;

    const paginatedRows = rows.slice(paginationParams.offset, paginationParams.offset + paginationParams.limit);

    const unreadIds = paginatedRows
      .filter(item => !readIds.includes(item.__instance.global_notification_id))
      .map(item => item.__instance.global_notification_id);

    if (unreadIds.length > 0) {
      await globalNotificationReadRepository.bulkMarkAsRead(unreadIds, userId);
      setImmediate(() => NotificationCountUtil.emitCountUpdate(userId));
    }

    logAudit(
      'NOTIFICATION_GLOBAL_LIST_VIEWED',
      userId,
      { totalItems, page: paginationParams.page },
      { entityType: 'GlobalNotification', entityTable: 'global_notifications' }
    );

    return { rows: paginatedRows, readIds, totalItems, paginationParams };
  }

  async getUnreadCount(userId) {
    const total = await this.computeUnreadCount(userId);

    NotificationEmitter.emit('count-updated', { userId, count: total });

    logAudit(
      'NOTIFICATION_UNREAD_COUNT_VIEWED',
      userId,
      { count: total },
      { entityType: 'Notification', entityTable: 'notifications' }
    );

    return total;
  }

  /**
   * Cálculo puro del contador (sin emitir ni auditar). Lo usa el stream SSE para refrescar cada
   * conexión abierta cuando llega el broadcast de una notificación global ({ global: true }).
   */
  async computeUnreadCount(userId) {
    const [personalCount, globalUnread] = await Promise.all([
      notificationRepository.countUnreadByUser(userId),
      globalNotificationRepository.findUnreadByUser(userId)
    ]);
    return personalCount + (Array.isArray(globalUnread) ? globalUnread.length : 0);
  }

  async createNotification(data, metadata, externalService = null) {
    const result = await notificationCreationService.crearNotificacion(data, metadata.transaction);

    logger.info('Notificación creada por servicio externo', {
      tipoNotificacion: data.tipoNotificacion,
      userId: data.userId,
      externalService
    });

    logAudit(
      'NOTIFICATION_CREATED',
      null,
      { tipoNotificacion: data.tipoNotificacion, userId: data.userId, externalService },
      { entityType: 'Notification', entityTable: 'notifications' }
    );

    return result;
  }

  async createDirectNotification(data) {
    const result = await notificationCreationService.crearNotificacionDirecta(data);

    logAudit(
      'NOTIFICATION_DIRECT_CREATED',
      null,
      { tipoNotificacion: data.tipoNotificacion, email: data.email },
      { entityType: 'Notification', entityTable: 'notifications' }
    );

    return result;
  }

  // ── Privados ───────────────────────────────────────────────────────────────

  async _getPersonalRaw(userId) {
    const rows = await notificationRepository.findAll(
      { user_id: userId },
      {
        order: [['created_at', 'DESC']],
        include: [{ association: 'notification_type' }]
      }
    );

    return rows.map(n => ({
      __type: 'personal',
      __instance: n,
      createdAt: n.createdAt,
      is_read: n.is_read
    }));
  }

  async _getGlobalRaw(userId) {
    const [rows, readIds] = await Promise.all([
      globalNotificationRepository.findActiveNotifications(),
      globalNotificationReadRepository.getReadIdsByUser(userId)
    ]);

    const tagged = rows.map(gn => ({
      __type: 'global',
      __instance: gn,
      createdAt: gn.createdAt,
      is_read: readIds.includes(gn.global_notification_id)
    }));

    return { rows: tagged, readIds };
  }

  _mergeAndSort(personal, globalTagged, sortBy, order) {
    const merged = [...personal, ...globalTagged];
    const direction = order === 'DESC' ? -1 : 1;
    return merged.sort((a, b) => direction * (new Date(a.createdAt) - new Date(b.createdAt)));
  }

  async _markPageAsRead(userId, paginatedMixed, readIds) {
    const transaction = await sequelize.transaction();
    try {
      const personalUnread = paginatedMixed
        .filter(item => item.__type === 'personal' && !item.is_read)
        .map(item => item.__instance.notification_id);

      const globalUnread = paginatedMixed
        .filter(item => item.__type === 'global' && !readIds.includes(item.__instance.global_notification_id))
        .map(item => item.__instance.global_notification_id);

      await Promise.all([
        personalUnread.length > 0 ? this._markPersonalAsRead(personalUnread, { transaction }) : Promise.resolve(),
        globalUnread.length > 0 ? globalNotificationReadRepository.bulkMarkAsRead(globalUnread, userId) : Promise.resolve()
      ]);

      await transaction.commit();

      if (personalUnread.length > 0 || globalUnread.length > 0) {
        setImmediate(() => NotificationCountUtil.emitCountUpdate(userId));
      }
    } catch (error) {
      await transaction.rollback();
      // Fallo de escritura en BD que el sistema no esperaba ni supo completar → error.
      logger.error('Error marcando notificaciones de página como leídas', { error: error.message, userId });
    }
  }

  _markPersonalAsRead(notificationIds, options = {}) {
    if (!notificationIds || notificationIds.length === 0) {
      return undefined;
    }
    return notificationRepository.bulkUpdate(
      { is_read: true, read_at: new Date() },
      { notification_id: { [Op.in]: notificationIds }, is_read: false },
      options
    );
  }
}

module.exports = new NotificationService();
