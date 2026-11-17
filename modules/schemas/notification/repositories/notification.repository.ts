import BaseRepository from '../../../../shared/repositories/base.repository';
import modelsModule from '../../../../shared/models';
const { Notification } = modelsModule;
import { Op, QueryTypes } from 'sequelize';
import constantsModule from '../../../../shared/constants';
const { database } = constantsModule;
import type { UpdateOptions } from 'sequelize';
import ReadRepository from '../../../../shared/repositories/read.repository';
import type defineNotification from '../models/notification.model';
import * as queryModule from '../../../../shared/repositories/query';
const { dateRange, toWhere } = queryModule;
import type { WhereClause } from '../../../../shared/repositories/query';

const PUSH_RETRY_DELAY_MINUTES = 15;
const EMAIL_RETRY_DELAY_MINUTES = 30;
const SMS_RETRY_DELAY_MINUTES = 30;

const PUSH_RETRY_DELAY_MS = PUSH_RETRY_DELAY_MINUTES * 60 * 1000;
const EMAIL_RETRY_DELAY_MS = EMAIL_RETRY_DELAY_MINUTES * 60 * 1000;
const SMS_RETRY_DELAY_MS = SMS_RETRY_DELAY_MINUTES * 60 * 1000;

class NotificationRepository extends BaseRepository<defineNotification.Instance> {
  constructor() {
    super(Notification);
  }

  /**
   * Obtiene notificaciones de un usuario con paginación
   * @param {string} userId
   * @param {Object} paginationParams - { page, limit, offset, sortBy, order }
   * @param {Object} searchConfig - { searchTerm, searchFields } (opcional)
   * @returns {Promise<{ rows: Array, count: number }>}
   */
  findByUserPaginated(
    userId: string,
    paginationParams: ReadRepository.PaginationParams = {},
    searchConfig: { searchTerm?: string | null; searchFields?: string[] } = {}
  ) {
    // user_id va por _extraFilters: findAllPaginated solo inyecta al WHERE las keys
    // conocidas (isActive / filterId) o lo que llegue en _extraFilters. Pasarlo como
    // primer arg (filters) lo ignoraba y devolvía notificaciones de TODOS los usuarios.
    return super.findAllPaginated({}, paginationParams, searchConfig.searchTerm ?? null, {
      _extraFilters: { user_id: userId },
      _searchFields: searchConfig.searchFields ?? [],
      include: [{ association: 'notification_type' }]
    });
  }

  /**
   * Cuenta notificaciones no leídas de un usuario
   */
  countUnreadByUser(userId: string) {
    return this.count({ user_id: userId, is_read: false });
  }

  /**
   * Marca una notificación como leída
   */
  markAsRead(notificationId: string) {
    return this.update(notificationId, {
      is_read: true,
      read_at: new Date()
    });
  }

  /**
   * Marca todas las notificaciones de un usuario como leídas
   */
  markAllAsReadByUser(userId: string) {
    return this.bulkUpdate({ is_read: true, read_at: new Date() }, { user_id: userId, is_read: false });
  }

  /**
   * Marca como leídas (solo las que siguen sin leer) un conjunto de notificaciones por ID.
   * @param {string[]} notificationIds
   * @param {object} [options] - opciones Sequelize (ej. { transaction })
   */
  markAsReadByIds(notificationIds: string[], options: Omit<UpdateOptions<defineNotification.Attributes>, 'where'> = {}) {
    return this.bulkUpdate(
      { is_read: true, read_at: new Date() },
      { notification_id: { [Op.in]: notificationIds }, is_read: false },
      options
    );
  }

  /**
   * Obtiene notificaciones pendientes de envío de push
   */
  findPendingPushRetries() {
    return this.findAll({
      push_sent: false,
      push_next_retry_at: { [Op.lte]: new Date() },
      push_retry_count: { [Op.lt]: 3 }
    });
  }

  /**
   * Obtiene notificaciones pendientes de envío de email
   */
  findPendingEmailRetries() {
    return this.findAll({
      email_sent: false,
      email_next_retry_at: { [Op.lte]: new Date() },
      email_retry_count: { [Op.lt]: 3 }
    });
  }

  /**
   * Obtiene notificaciones pendientes de envío de SMS
   */
  findPendingSmsRetries() {
    return this.findAll({
      sms_sent: false,
      sms_next_retry_at: { [Op.lte]: new Date() },
      sms_retry_count: { [Op.lt]: 3 }
    });
  }

  /**
   * Obtiene notificaciones programadas listas para enviar
   */
  findScheduledReady() {
    return this.findAll({
      processing_status: 'pending',
      scheduled_for: { [Op.lte]: new Date() }
    });
  }

  /**
   * Actualiza estado de procesamiento
   */
  updateProcessingStatus(notificationId: string, status: defineNotification.Attributes['processing_status']) {
    return this.update(notificationId, {
      processing_status: status
    });
  }

  /**
   * Marca push como enviado exitosamente
   */
  markPushSent(notificationId: string) {
    return this.update(notificationId, {
      push_sent: true,
      push_sent_at: new Date(),
      push_error: null
    });
  }

  /**
   * Registra error en push
   */
  async recordPushError(notificationId: string, error: string, nextRetryAt: Date | null = null) {
    const notification = await this.findById(notificationId); // FIX: await faltante — sin él, notification era una Promise y push_retry_count resultaba NaN
    return this.update(notificationId, {
      push_error: error,
      push_retry_count: (notification?.push_retry_count ?? 0) + 1,
      push_next_retry_at: nextRetryAt || new Date(Date.now() + PUSH_RETRY_DELAY_MS)
    });
  }

  /**
   * Marca email como enviado exitosamente
   */
  markEmailSent(notificationId: string) {
    return this.update(notificationId, {
      email_sent: true,
      email_sent_at: new Date(),
      email_error: null
    });
  }

  /**
   * Registra error en email
   */
  async recordEmailError(notificationId: string, error: string, nextRetryAt: Date | null = null) {
    const notification = await this.findById(notificationId); // FIX: await faltante — sin él, notification era una Promise y email_retry_count resultaba NaN
    return this.update(notificationId, {
      email_error: error,
      email_retry_count: (notification?.email_retry_count ?? 0) + 1,
      email_next_retry_at: nextRetryAt || new Date(Date.now() + EMAIL_RETRY_DELAY_MS)
    });
  }

  /**
   * Marca SMS como enviado exitosamente
   */
  markSmsSent(notificationId: string) {
    return this.update(notificationId, {
      sms_sent: true,
      sms_sent_at: new Date(),
      sms_error: null
    });
  }

  /**
   * Registra error en SMS
   */
  async recordSmsError(notificationId: string, error: string, nextRetryAt: Date | null = null) {
    const notification = await this.findById(notificationId);
    return this.update(notificationId, {
      sms_error: error,
      sms_retry_count: (notification?.sms_retry_count ?? 0) + 1,
      sms_next_retry_at: nextRetryAt || new Date(Date.now() + SMS_RETRY_DELAY_MS)
    });
  }

  /**
   * Cierra el canal email tras un hard bounce: pone email_next_retry_at = null para que
   * findPendingEmailRetries deje de seleccionarla (filtra por <= now, null no matchea). CAMBIO 6.
   */
  markEmailPermanentFailure(notificationId: string, reason: string) {
    return this.update(notificationId, {
      email_error: reason,
      email_next_retry_at: null
    });
  }

  /**
   * Cierra el canal push tras un hard bounce (análogo a markEmailPermanentFailure). CAMBIO 6.
   */
  markPushPermanentFailure(notificationId: string, reason: string) {
    return this.update(notificationId, {
      push_error: reason,
      push_next_retry_at: null
    });
  }

  /**
   * Obtiene notificaciones recientes de un usuario (últimas 24h)
   */
  findRecentByUser(userId: string, hours = 24) {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hours);

    return this.findAll(
      {
        user_id: userId,
        createdAt: { [Op.gte]: cutoffDate }
      },
      { order: [['created_at', 'DESC']] }
    );
  }

  /**
   * Listado admin con filtros para el módulo de entregas.
   * Incluye notification_type para que el admin vea qué evento originó la notificación.
   */
  findAllForAdmin(
    {
      processingStatus = null,
      channel = null,
      userId = null,
      from = null,
      to = null,
      onlyCritical = null
    }: NotificationRepository.AdminFilters = {},
    paginationParams: ReadRepository.PaginationParams = {}
  ) {
    const where: WhereClause = {};

    if (processingStatus) {
      where.processing_status = processingStatus;
    }
    if (userId) {
      where.user_id = userId;
    }
    const createdAtRange = dateRange(from, to);
    if (createdAtRange) {
      where.created_at = createdAtRange;
    }

    // Filtro por canal: solo las que tienen error en ese canal o no fueron enviadas
    if (channel === 'email') {
      where[Op.or] = [{ email_sent: false }, { email_error: { [Op.ne]: null } }];
    } else if (channel === 'push') {
      where[Op.or] = [{ push_sent: false }, { push_error: { [Op.ne]: null } }];
    } else if (channel === 'sms') {
      where[Op.or] = [{ sms_sent: false }, { sms_error: { [Op.ne]: null } }];
    }

    return this.model.findAndCountAll({
      where: toWhere(where),
      include: [
        {
          association: 'notification_type',
          attributes: ['notification_type_id', 'code', 'name', 'notification_category_id'],
          // onlyCritical exige que el join al tipo también sea INNER para propagar el filtro de categoría.
          ...(onlyCritical ? { required: true } : {}),
          // Canales (supports_*) y criticidad (is_critical) viven en la categoría (fuente de verdad).
          include: [
            {
              association: 'category',
              attributes: [
                'notification_category_id',
                'code',
                'name',
                'supports_push',
                'supports_email',
                'supports_sms',
                'is_critical'
              ],
              // onlyCritical=true → solo notificaciones cuya categoría es crítica (INNER JOIN).
              ...(onlyCritical ? { where: { is_critical: true }, required: true } : {})
            }
          ]
        }
      ],
      limit: paginationParams.limit,
      offset: paginationParams.offset,
      order: [['created_at', 'DESC']],
      distinct: true
    });
  }

  /**
   * Métricas agregadas de entrega para el panel admin, agrupadas por categoría.
   * Para cada categoría devuelve el conteo por processing_status y, por canal (email/push/sms),
   * cuántas se intentaron / enviaron / fallaron. El % de éxito lo calcula el DTO a partir de esto.
   *
   * "Intentado" = enviado OK o con error registrado; "fallado" = no enviado y con error. Así el
   * denominador excluye las notificaciones donde el canal ni siquiera aplicó (no infla el fallo).
   * Usa COUNT(*) FILTER (WHERE ...) de Postgres. Filtros opcionales: rango de fechas y userId.
   */
  deliveryMetrics({ from = null, to = null, userId = null }: Pick<NotificationRepository.AdminFilters, 'from' | 'to' | 'userId'> = {}) {
    const schema = database.schema ? `"${database.schema}".` : '';
    const conditions: string[] = [];
    const replacements: Record<string, unknown> = {};
    if (from) {
      conditions.push('n.created_at >= :from');
      replacements.from = new Date(from);
    }
    if (to) {
      conditions.push('n.created_at <= :to');
      replacements.to = new Date(to);
    }
    if (userId) {
      conditions.push('n.user_id = :userId');
      replacements.userId = userId;
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        c.code AS category_code,
        c.name AS category_name,
        COUNT(n.notification_id)::int AS total,
        COUNT(*) FILTER (WHERE n.processing_status = 'completed')::int AS status_completed,
        COUNT(*) FILTER (WHERE n.processing_status = 'partial_failure')::int AS status_partial_failure,
        COUNT(*) FILTER (WHERE n.processing_status = 'failed')::int AS status_failed,
        COUNT(*) FILTER (WHERE n.processing_status = 'pending')::int AS status_pending,
        COUNT(*) FILTER (WHERE n.processing_status = 'processing')::int AS status_processing,
        COUNT(*) FILTER (WHERE n.email_sent OR n.email_error IS NOT NULL)::int AS email_attempted,
        COUNT(*) FILTER (WHERE n.email_sent)::int AS email_sent,
        COUNT(*) FILTER (WHERE NOT n.email_sent AND n.email_error IS NOT NULL)::int AS email_failed,
        COUNT(*) FILTER (WHERE n.push_sent OR n.push_error IS NOT NULL)::int AS push_attempted,
        COUNT(*) FILTER (WHERE n.push_sent)::int AS push_sent,
        COUNT(*) FILTER (WHERE NOT n.push_sent AND n.push_error IS NOT NULL)::int AS push_failed,
        COUNT(*) FILTER (WHERE n.sms_sent OR n.sms_error IS NOT NULL)::int AS sms_attempted,
        COUNT(*) FILTER (WHERE n.sms_sent)::int AS sms_sent,
        COUNT(*) FILTER (WHERE NOT n.sms_sent AND n.sms_error IS NOT NULL)::int AS sms_failed
      FROM ${schema}"notifications" n
      LEFT JOIN ${schema}"notification_types" t ON t.notification_type_id = n.notification_type_id
      LEFT JOIN ${schema}"notification_categories" c ON c.notification_category_id = t.notification_category_id
      ${whereClause}
      GROUP BY c.code, c.name
      ORDER BY total DESC
    `;

    return this.sequelize.query<NotificationRepository.DeliveryMetricsRow>(sql, { replacements, type: QueryTypes.SELECT });
  }

  findByIdWithType(notificationId: string) {
    return this.model.findByPk(notificationId, {
      include: [{ association: 'notification_type', include: [{ association: 'category' }] }]
    });
  }

  /**
   * Resetea los campos de error de un canal para permitir reintento manual.
   * @param {string} notificationId
   * @param {'email'|'push'|'sms'|'all'} channel
   */
  resetForRetry(notificationId: string, channel: 'email' | 'push' | 'sms' | 'all' = 'all') {
    const fields: Partial<defineNotification.Attributes> = { processing_status: 'pending' };

    if (channel === 'email' || channel === 'all') {
      fields.email_error = null;
      fields.email_retry_count = 0;
      fields.email_next_retry_at = null;
      fields.email_sent = false;
      fields.email_sent_at = null;
    }
    if (channel === 'push' || channel === 'all') {
      fields.push_error = null;
      fields.push_retry_count = 0;
      fields.push_next_retry_at = null;
      fields.push_sent = false;
      fields.push_sent_at = null;
    }
    if (channel === 'sms' || channel === 'all') {
      fields.sms_error = null;
      fields.sms_retry_count = 0;
      fields.sms_next_retry_at = null;
      fields.sms_sent = false;
      fields.sms_sent_at = null;
    }

    return this.update(notificationId, fields);
  }

  /**
   * Elimina notificaciones antiguas ya leídas (limpieza)
   */
  deleteOldRead(daysOld = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return this.bulkDelete({
      is_read: true,
      read_at: { [Op.lt]: cutoffDate }
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace NotificationRepository {
  export interface AdminFilters {
    processingStatus?: defineNotification.Attributes['processing_status'] | null;
    channel?: 'email' | 'push' | 'sms' | null;
    userId?: string | null;
    from?: string | Date | null;
    to?: string | Date | null;
    onlyCritical?: boolean | null;
  }

  /** Fila de deliveryMetrics (una por categoría; los COUNT vienen como ::int). */
  export interface DeliveryMetricsRow {
    category_code: string | null;
    category_name: string | null;
    total: number;
    status_completed: number;
    status_partial_failure: number;
    status_failed: number;
    status_pending: number;
    status_processing: number;
    email_attempted: number;
    email_sent: number;
    email_failed: number;
    push_attempted: number;
    push_sent: number;
    push_failed: number;
    sms_attempted: number;
    sms_sent: number;
    sms_failed: number;
  }
}

export default new NotificationRepository();
