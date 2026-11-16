import type Feed = require('../notification-feed.types');
import type { Transaction } from 'sequelize';
import unitOfWork = require('../../../../shared/database/unit-of-work');
import loggerUtilModule = require('../../../../shared/utils/logger.util');
const { logger, logAudit } = loggerUtilModule;
import PaginationHelper = require('../../../../shared/utils/pagination.util');
import notificationRepository = require('../../../schemas/notification/repositories/notification.repository');
import globalNotificationRepository = require('../../../schemas/notification/repositories/global-notification.repository');
// eslint-disable-next-line max-len -- ruta de require de una sola línea; Prettier no la parte
import globalNotificationReadRepository = require('../../../schemas/notification/repositories/global-notification-read.repository');
import notificationCreationService = require('../../../schemas/notification/services/notification-creation.service');
import NotificationEmitter = require('../../../schemas/notification/utils/notification-emitter.util');
import NotificationCountUtil = require('../../../schemas/notification/utils/notification-count.util');
import errorMessageModule = require('../../../../shared/utils/error-message.util');

const { errorMessage } = errorMessageModule;


class NotificationService {
  unitOfWork: typeof unitOfWork;
  notificationRepository: typeof notificationRepository;
  globalNotificationRepository: typeof globalNotificationRepository;
  globalNotificationReadRepository: typeof globalNotificationReadRepository;
  notificationCreationService: typeof notificationCreationService;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new NotificationService({ unitOfWork: fake })
   * @param {object} [deps]
   */
  constructor(deps: NotificationService.Deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.notificationRepository = deps.notificationRepository ?? notificationRepository;
    this.globalNotificationRepository = deps.globalNotificationRepository ?? globalNotificationRepository;
    this.globalNotificationReadRepository = deps.globalNotificationReadRepository ?? globalNotificationReadRepository;
    this.notificationCreationService = deps.notificationCreationService ?? notificationCreationService;
  }

  // ── Públicos ───────────────────────────────────────────────────────────────

  async getNotificationsList(userId: string, query: Record<string, unknown>): Promise<Feed.MixedListResult & { personal: Feed.FeedItem[]; global: Feed.GlobalFeedItem[] }> {
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

  async getPersonalNotifications(userId: string, query: Record<string, unknown>): Promise<Feed.PersonalListResult> {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const searchTerm = typeof query.search === 'string' && query.search ? query.search : null;
    const searchConfig = searchTerm ? { searchTerm, searchFields: ['title', 'body'] } : {};
    const { rows, count } = await this.notificationRepository.findByUserPaginated(userId, paginationParams, searchConfig);

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

  async getGlobalNotifications(userId: string, query: Record<string, unknown>): Promise<Feed.GlobalListResult> {
    const paginationParams = PaginationHelper.getPaginationParams(query);

    const { rows, readIds } = await this._getGlobalRaw(userId);
    const totalItems = rows.length;

    const paginatedRows = rows.slice(paginationParams.offset, paginationParams.offset + paginationParams.limit);

    const unreadIds = paginatedRows
      .filter(item => !readIds.includes(item.__instance.global_notification_id))
      .map(item => item.__instance.global_notification_id);

    if (unreadIds.length > 0) {
      await this.globalNotificationReadRepository.bulkMarkAsRead(unreadIds, userId);
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

  async getUnreadCount(userId: string) {
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
  async computeUnreadCount(userId: string) {
    const [personalCount, globalUnread] = await Promise.all([
      this.notificationRepository.countUnreadByUser(userId),
      this.globalNotificationRepository.findUnreadByUser(userId)
    ]);
    return personalCount + (Array.isArray(globalUnread) ? globalUnread.length : 0);
  }

  async createNotification(
    data: NotificationService.CreateInput,
    metadata: { transaction?: Transaction | null } = {},
    externalService: string | null | undefined = null
  ) {
    const result = await this.notificationCreationService.crearNotificacion(data, metadata.transaction ?? null);

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

  async createDirectNotification(data: Parameters<NotificationService['notificationCreationService']['crearNotificacionDirecta']>[0]) {
    const result = await this.notificationCreationService.crearNotificacionDirecta(data);

    logAudit(
      'NOTIFICATION_DIRECT_CREATED',
      null,
      { tipoNotificacion: data.tipoNotificacion, email: data.email },
      { entityType: 'Notification', entityTable: 'notifications' }
    );

    return result;
  }

  // ── Privados ───────────────────────────────────────────────────────────────

  async _getPersonalRaw(userId: string) {
    const rows = await this.notificationRepository.findAll(
      { user_id: userId },
      {
        order: [['created_at', 'DESC']],
        include: [{ association: 'notification_type' }]
      }
    );

    return rows.map((n): Feed.FeedItem => ({
      __type: 'personal',
      __instance: n,
      createdAt: n.createdAt,
      is_read: n.is_read
    }));
  }

  async _getGlobalRaw(userId: string) {
    const [rows, readIds] = await Promise.all([
      this.globalNotificationRepository.findActiveNotifications(),
      this.globalNotificationReadRepository.getReadIdsByUser(userId)
    ]);

    const tagged = rows.map((gn): Feed.GlobalFeedItem => ({
      __type: 'global',
      __instance: gn,
      createdAt: gn.createdAt,
      is_read: readIds.includes(gn.global_notification_id)
    }));

    return { rows: tagged, readIds };
  }

  _mergeAndSort(personal: Feed.FeedItem[], globalTagged: Feed.FeedItem[], sortBy: string, order: string): Feed.FeedItem[] {
    const merged = [...personal, ...globalTagged];
    const direction = order === 'DESC' ? -1 : 1;
    return merged.sort((a, b) => direction * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
  }

  async _markPageAsRead(userId: string, paginatedMixed: Feed.FeedItem[], readIds: string[]) {
    const transaction = await this.unitOfWork.begin();
    try {
      const personalUnread = paginatedMixed.flatMap(item =>
        item.__type === 'personal' && !item.is_read ? [item.__instance.notification_id] : []
      );

      const globalUnread = paginatedMixed.flatMap(item =>
        item.__type === 'global' && !readIds.includes(item.__instance.global_notification_id)
          ? [item.__instance.global_notification_id]
          : []
      );

      await Promise.all([
        personalUnread.length > 0 ? this._markPersonalAsRead(personalUnread, { transaction }) : Promise.resolve(),
        globalUnread.length > 0 ? this.globalNotificationReadRepository.bulkMarkAsRead(globalUnread, userId) : Promise.resolve()
      ]);

      await transaction.commit();

      if (personalUnread.length > 0 || globalUnread.length > 0) {
        setImmediate(() => NotificationCountUtil.emitCountUpdate(userId));
      }
    } catch (error) {
      await transaction.rollback();
      // Fallo de escritura en BD que el sistema no esperaba ni supo completar → error.
      logger.error('Error marcando notificaciones de página como leídas', { error: errorMessage(error), userId });
    }
  }

  _markPersonalAsRead(notificationIds: string[], options: Parameters<NotificationService['notificationRepository']['markAsReadByIds']>[1] = {}) {
    if (!notificationIds || notificationIds.length === 0) {
      return undefined;
    }
    return this.notificationRepository.markAsReadByIds(notificationIds, options);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace NotificationService {
  export type CreateInput = Parameters<(typeof notificationCreationService)['crearNotificacion']>[0];

  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    unitOfWork?: typeof unitOfWork;
    notificationRepository?: typeof notificationRepository;
    globalNotificationRepository?: typeof globalNotificationRepository;
    globalNotificationReadRepository?: typeof globalNotificationReadRepository;
    notificationCreationService?: typeof notificationCreationService;
  }
}

export = Object.assign(new NotificationService(), { NotificationService });
