// modules/schemas/notification/repositories/global-notification.repository.ts
//
// Notificaciones globales (a todos los usuarios): estado del envío masivo por canal y vigencia in-app.
import PrismaRepository from '../../../../shared/repositories/prisma.repository';
import type { GlobalNotification, NotificationProcessingStatus, Prisma } from '../../../../shared/database/generated/prisma/client';

const WITH_TYPE = { notificationType: true } satisfies Prisma.GlobalNotificationInclude;

/** Activas, visibles in-app y vigentes ahora (empezaron y no terminaron). */
function activeNow(): Prisma.GlobalNotificationWhereInput {
  const now = new Date();
  return {
    isActive: true,
    sendInApp: true,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }]
  };
}

class GlobalNotificationRepository extends PrismaRepository {
  async create(data: Prisma.GlobalNotificationUncheckedCreateInput): Promise<GlobalNotification> {
    // starts_at: el DEFAULT now() lo ponía el modelo de Sequelize; el schema de Prisma no lo declara.
    return (await this.db()).globalNotification.create({ data: { startsAt: new Date(), ...data } });
  }

  /** null si la fila ya no existe. */
  async update(globalNotificationId: string, data: Prisma.GlobalNotificationUncheckedUpdateManyInput): Promise<GlobalNotification | null> {
    const [row] = await (await this.db()).globalNotification.updateManyAndReturn({ where: { globalNotificationId }, data });
    return row ?? null;
  }

  updatePushProcessingStatus(globalNotificationId: string, status: NotificationProcessingStatus) {
    return this.update(globalNotificationId, { pushProcessingStatus: status });
  }

  updateEmailProcessingStatus(globalNotificationId: string, status: NotificationProcessingStatus) {
    return this.update(globalNotificationId, { emailProcessingStatus: status });
  }

  incrementPushSentCount(globalNotificationId: string, amount = 1) {
    return this.update(globalNotificationId, { pushSentCount: { increment: amount } });
  }

  incrementEmailSentCount(globalNotificationId: string, amount = 1) {
    return this.update(globalNotificationId, { emailSentCount: { increment: amount } });
  }

  /** Vigentes para mostrar a los usuarios, más recientes primero, con su tipo. */
  async findActiveNotifications() {
    return (await this.db()).globalNotification.findMany({ where: activeNow(), include: WITH_TYPE, orderBy: { createdAt: 'desc' } });
  }

  /** Vigentes que el usuario todavía no leyó, con su tipo. */
  async findUnreadByUser(userId: string) {
    return (await this.db()).globalNotification.findMany({
      where: { ...activeNow(), globalNotificationReads: { none: { userId } } },
      include: WITH_TYPE,
      orderBy: { createdAt: 'desc' }
    });
  }
}

export default new GlobalNotificationRepository();
