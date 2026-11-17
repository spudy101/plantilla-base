// modules/schemas/notification/repositories/notification.repository.ts
//
// Notificaciones personales (in-app + estado de entrega por canal: push, email, sms).
import PrismaRepository from '../../../../shared/repositories/prisma.repository';
import { Prisma } from '../../../../shared/database/generated/prisma/client';
import type { Notification } from '../../../../shared/database/generated/prisma/client';
import constantsModule from '../../../../shared/constants';
const { database } = constantsModule;
import { toCategoryRow } from './notification-category.repository';

const PUSH_RETRY_DELAY_MINUTES = 15;
const EMAIL_RETRY_DELAY_MINUTES = 30;
const SMS_RETRY_DELAY_MINUTES = 30;
const MAX_CHANNEL_RETRIES = 3;

const PUSH_RETRY_DELAY_MS = PUSH_RETRY_DELAY_MINUTES * 60 * 1000;
const EMAIL_RETRY_DELAY_MS = EMAIL_RETRY_DELAY_MINUTES * 60 * 1000;
const SMS_RETRY_DELAY_MS = SMS_RETRY_DELAY_MINUTES * 60 * 1000;

type Channel = 'email' | 'push' | 'sms';

const WITH_TYPE = { notificationType: true } satisfies Prisma.NotificationInclude;
const WITH_TYPE_AND_CATEGORY = { notificationType: { include: { category: true } } } satisfies Prisma.NotificationInclude;

const LIST_SORTABLE = Object.values(Prisma.NotificationScalarFieldEnum);

/** Notificación con su tipo y la categoría del tipo (horario por defecto como texto). */
function withTypeAndCategory<T extends Prisma.NotificationGetPayload<{ include: typeof WITH_TYPE_AND_CATEGORY }>>(row: T) {
  const type = row.notificationType;
  return { ...row, notificationType: type && { ...type, category: type.category && toCategoryRow(type.category) } };
}

class NotificationRepository extends PrismaRepository {
  async create(data: Prisma.NotificationUncheckedCreateInput): Promise<Notification> {
    return (await this.db()).notification.create({ data });
  }

  async findById(notificationId: string): Promise<Notification | null> {
    return (await this.db()).notification.findUnique({ where: { notificationId } });
  }

  async findByIdWithType(notificationId: string) {
    const row = await (await this.db()).notification.findUnique({ where: { notificationId }, include: WITH_TYPE_AND_CATEGORY });
    return row && withTypeAndCategory(row);
  }

  /** null si la fila ya no existe. */
  async update(notificationId: string, data: Prisma.NotificationUncheckedUpdateManyInput): Promise<Notification | null> {
    const [row] = await (await this.db()).notification.updateManyAndReturn({ where: { notificationId }, data });
    return row ?? null;
  }

  /** Notificaciones de un usuario, paginadas y con su tipo; búsqueda opcional sin mayúsculas. */
  async findByUserPaginated(
    userId: string,
    pagination: PrismaRepository.PaginationParams = {},
    { searchTerm = null, searchFields = [] }: { searchTerm?: string | null; searchFields?: string[] } = {}
  ) {
    const where = { userId, ...this.searchWhere(searchTerm, searchFields) } as Prisma.NotificationWhereInput;
    const db = await this.db();
    const [rows, count] = await Promise.all([
      db.notification.findMany({ where, include: WITH_TYPE, ...this.paginationArgs(LIST_SORTABLE, pagination) }),
      db.notification.count({ where })
    ]);
    return { rows, count };
  }

  /** Todas las de un usuario, más recientes primero, con su tipo (feed unificado). */
  async findAllByUser(userId: string) {
    return (await this.db()).notification.findMany({ where: { userId }, include: WITH_TYPE, orderBy: { createdAt: 'desc' } });
  }

  async countUnreadByUser(userId: string): Promise<number> {
    return (await this.db()).notification.count({ where: { userId, isRead: false } });
  }

  /** Marca como leídas (solo las que siguen sin leer) las notificaciones indicadas; devuelve cuántas. */
  async markAsReadByIds(notificationIds: string[]): Promise<number> {
    const { count } = await (await this.db()).notification.updateMany({
      where: { notificationId: { in: notificationIds }, isRead: false },
      data: { isRead: true, readAt: new Date() }
    });
    return count;
  }

  private async findPendingRetries(channel: Channel): Promise<Notification[]> {
    const where = {
      [`${channel}Sent`]: false,
      [`${channel}NextRetryAt`]: { lte: new Date() },
      [`${channel}RetryCount`]: { lt: MAX_CHANNEL_RETRIES }
    } as Prisma.NotificationWhereInput;
    return (await this.db()).notification.findMany({ where });
  }

  findPendingPushRetries() {
    return this.findPendingRetries('push');
  }

  findPendingEmailRetries() {
    return this.findPendingRetries('email');
  }

  findPendingSmsRetries() {
    return this.findPendingRetries('sms');
  }

  /** Programadas listas para enviar. */
  async findScheduledReady(): Promise<Notification[]> {
    return (await this.db()).notification.findMany({ where: { processingStatus: 'pending', scheduledFor: { lte: new Date() } } });
  }

  updateProcessingStatus(notificationId: string, status: string) {
    return this.update(notificationId, { processingStatus: status });
  }

  markPushSent(notificationId: string) {
    return this.update(notificationId, { pushSent: true, pushSentAt: new Date(), pushError: null });
  }

  markEmailSent(notificationId: string) {
    return this.update(notificationId, { emailSent: true, emailSentAt: new Date(), emailError: null });
  }

  markSmsSent(notificationId: string) {
    return this.update(notificationId, { smsSent: true, smsSentAt: new Date(), smsError: null });
  }

  // El contador se incrementa en la base (antes: leer + escribir, y dos errores simultáneos perdían uno).
  recordPushError(notificationId: string, error: string, nextRetryAt: Date | null = null) {
    return this.update(notificationId, {
      pushError: error,
      pushRetryCount: { increment: 1 },
      pushNextRetryAt: nextRetryAt || new Date(Date.now() + PUSH_RETRY_DELAY_MS)
    });
  }

  recordEmailError(notificationId: string, error: string, nextRetryAt: Date | null = null) {
    return this.update(notificationId, {
      emailError: error,
      emailRetryCount: { increment: 1 },
      emailNextRetryAt: nextRetryAt || new Date(Date.now() + EMAIL_RETRY_DELAY_MS)
    });
  }

  recordSmsError(notificationId: string, error: string, nextRetryAt: Date | null = null) {
    return this.update(notificationId, {
      smsError: error,
      smsRetryCount: { increment: 1 },
      smsNextRetryAt: nextRetryAt || new Date(Date.now() + SMS_RETRY_DELAY_MS)
    });
  }

  /**
   * Cierra el canal email tras un hard bounce: emailNextRetryAt = null para que findPendingEmailRetries
   * deje de seleccionarla (filtra por <= now, null no coincide).
   */
  markEmailPermanentFailure(notificationId: string, reason: string) {
    return this.update(notificationId, { emailError: reason, emailNextRetryAt: null });
  }

  /** Cierra el canal push tras un hard bounce (análogo a markEmailPermanentFailure). */
  markPushPermanentFailure(notificationId: string, reason: string) {
    return this.update(notificationId, { pushError: reason, pushNextRetryAt: null });
  }

  /**
   * Listado admin con filtros para el módulo de entregas, con el tipo y su categoría (canales y
   * criticidad viven en la categoría). `channel`: las que no se enviaron o tuvieron error en ese canal.
   */
  async findAllForAdmin(
    { processingStatus = null, channel = null, userId = null, from = null, to = null, onlyCritical = null }: NotificationRepository.AdminFilters = {},
    { limit, offset }: PrismaRepository.PaginationParams = {}
  ) {
    const where: Prisma.NotificationWhereInput = {};
    if (processingStatus) {
      where.processingStatus = processingStatus;
    }
    if (userId) {
      where.userId = userId;
    }
    if (from || to) {
      where.createdAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
    }
    if (channel) {
      where.OR = [{ [`${channel}Sent`]: false }, { [`${channel}Error`]: { not: null } }];
    }
    if (onlyCritical) {
      where.notificationType = { category: { isCritical: true } };
    }

    const db = await this.db();
    const [rows, count] = await Promise.all([
      db.notification.findMany({
        where,
        include: {
          notificationType: {
            select: {
              notificationTypeId: true,
              code: true,
              name: true,
              notificationCategoryId: true,
              category: {
                select: {
                  notificationCategoryId: true,
                  code: true,
                  name: true,
                  supportsPush: true,
                  supportsEmail: true,
                  supportsSms: true,
                  isCritical: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      db.notification.count({ where })
    ]);
    return { rows, count };
  }

  /**
   * Métricas agregadas de entrega para el panel admin, agrupadas por categoría: conteo por
   * processing_status y, por canal, cuántas se intentaron / enviaron / fallaron (el % lo calcula el DTO).
   * "Intentado" = enviado OK o con error; "fallado" = no enviado y con error. COUNT(*) FILTER de Postgres.
   */
  async deliveryMetrics({ from = null, to = null, userId = null }: Pick<NotificationRepository.AdminFilters, 'from' | 'to' | 'userId'> = {}) {
    // SQL crudo: el `schema` de PrismaPg no cambia el search_path, así que las tablas van calificadas.
    const table = (name: string) => Prisma.raw(`${database.schema ? `"${database.schema}".` : ''}"${name}"`);
    const conditions: Prisma.Sql[] = [];
    if (from) {
      conditions.push(Prisma.sql`n.created_at >= ${new Date(from)}`);
    }
    if (to) {
      conditions.push(Prisma.sql`n.created_at <= ${new Date(to)}`);
    }
    if (userId) {
      conditions.push(Prisma.sql`n.user_id = ${userId}::uuid`);
    }
    const whereClause = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    return (await this.db()).$queryRaw<NotificationRepository.DeliveryMetricsRow[]>`
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
      FROM ${table('notifications')} n
      LEFT JOIN ${table('notification_types')} t ON t.notification_type_id = n.notification_type_id
      LEFT JOIN ${table('notification_categories')} c ON c.notification_category_id = t.notification_category_id
      ${whereClause}
      GROUP BY c.code, c.name
      ORDER BY total DESC
    `;
  }

  /** Resetea los campos de un canal (o de todos) para permitir un reintento manual. */
  resetForRetry(notificationId: string, channel: Channel | 'all' = 'all') {
    const data: Prisma.NotificationUncheckedUpdateManyInput = { processingStatus: 'pending' };
    for (const c of ['email', 'push', 'sms'] as const) {
      if (channel === c || channel === 'all') {
        Object.assign(data, {
          [`${c}Error`]: null,
          [`${c}RetryCount`]: 0,
          [`${c}NextRetryAt`]: null,
          [`${c}Sent`]: false,
          [`${c}SentAt`]: null
        });
      }
    }
    return this.update(notificationId, data);
  }

  /** Elimina notificaciones ya leídas más viejas que `daysOld` días; devuelve cuántas. */
  async deleteOldRead(daysOld = 90): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    return (await (await this.db()).notification.deleteMany({ where: { isRead: true, readAt: { lt: cutoff } } })).count;
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace NotificationRepository {
  export interface AdminFilters {
    processingStatus?: string | null;
    channel?: Channel | null;
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
