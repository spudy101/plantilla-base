// tests/integration/notifications.test.ts
//
// Grupo 3 de la fase 5 (docs/prisma-migration.md) contra Postgres real: notificaciones sobre Prisma.
// Cubre lo que un mock no prueba: el SQL crudo de métricas (tablas calificadas con el esquema), las
// columnas TIME del horario de no molestar, los upserts sin UNIQUE útil (NULL ≠ NULL), las lecturas de
// globales con skipDuplicates y los contadores que se incrementan en la base.

import { randomUUID } from 'node:crypto';
import prisma from '../../shared/database/prisma';
import db from '../../shared/models';
import notificationRepository from '../../modules/schemas/notification/repositories/notification.repository';
import notificationTypeRepository from '../../modules/schemas/notification/repositories/notification-type.repository';
import notificationCategoryRepository from '../../modules/schemas/notification/repositories/notification-category.repository';
import globalNotificationRepository from '../../modules/schemas/notification/repositories/global-notification.repository';
import globalNotificationReadRepository from '../../modules/schemas/notification/repositories/global-notification-read.repository';
import preferenceRepository from '../../modules/schemas/kyc/person/repositories/user-notification-preference.repository';
import verificationCodeRepository from '../../modules/schemas/notification/repositories/verification-code.repository';
import emailBounceSuppressionRepository from '../../modules/schemas/notification/repositories/email-bounce-suppression.repository';

const TAG = `notif-it-${randomUUID().slice(0, 8)}`;
const CODE = TAG.toUpperCase().replace(/-/g, '_');
let roleId: string;
let personId: string;
let userId: string;
let categoryId: string;
let typeId: string;

describe('Notificaciones · Prisma contra Postgres', () => {
  beforeAll(async () => {
    roleId = (await prisma.role.create({ data: { name: TAG } })).roleId;
    personId = (await prisma.person.create({ data: { firstName: 'Ada', lastName: TAG } })).personId;
    userId = (await prisma.user.create({ data: { username: TAG, personId, roleId } })).userId;
    categoryId = (
      await notificationCategoryRepository.create({ code: CODE, name: TAG, defaultQuietHoursStart: '22:00', defaultQuietHoursEnd: '07:00' })
    ).notificationCategoryId;
    typeId = (
      await prisma.notificationType.create({
        data: { code: CODE, name: TAG, titleTemplate: 'Hola {{x}}', bodyTemplate: 'B', notificationCategoryId: categoryId, isActive: true }
      })
    ).notificationTypeId;
  });

  afterAll(async () => {
    await prisma.globalNotification.deleteMany({ where: { notificationTypeId: typeId } });
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.userNotificationPreference.deleteMany({ where: { userId } });
    await prisma.notificationType.deleteMany({ where: { notificationTypeId: typeId } });
    await prisma.notificationCategory.deleteMany({ where: { notificationCategoryId: categoryId } });
    await prisma.verificationCode.deleteMany({ where: { contactValue: `${TAG}@test.local` } });
    await prisma.emailBounceSuppression.deleteMany({ where: { emailHash: TAG } });
    await prisma.user.deleteMany({ where: { userId } });
    await prisma.person.deleteMany({ where: { personId } });
    await prisma.role.deleteMany({ where: { roleId } });
    await prisma.$disconnect();
    await db.sequelize.close();
  });

  it('categoría y tipo: el horario TIME entra y sale como "HH:MM:SS" y el tipo trae su categoría', async () => {
    const category = await notificationCategoryRepository.findByCode(CODE);
    expect(category).toMatchObject({ defaultQuietHoursStart: '22:00:00', defaultQuietHoursEnd: '07:00:00' });

    const type = await notificationTypeRepository.findByCode(CODE);
    expect(type?.category).toMatchObject({ code: CODE, defaultQuietHoursStart: '22:00:00' });
    expect(await notificationTypeRepository.countByCategory(categoryId)).toBe(1);
  });

  it('preferencia global: el upsert no duplica (NULL ≠ NULL en la UNIQUE) y conserva lo que no vino', async () => {
    await preferenceRepository.upsertGlobalPreference(userId, { allowPush: true, quietHoursStart: '23:30', quietHoursEnd: '06:00' });
    await preferenceRepository.upsertGlobalPreference(userId, { allowPush: false });

    const all = await preferenceRepository.findAllByUser(userId);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ allowPush: false, quietHoursStart: '23:30:00', quietHoursEnd: '06:00:00', notificationCategory: null });
    expect(await preferenceRepository.userAllowsPush(userId, CODE)).toBe(false);

    await preferenceRepository.upsertCategoryPreference(userId, CODE, { allowPush: true });
    expect(await preferenceRepository.userAllowsPush(userId, CODE)).toBe(true);
    expect((await preferenceRepository.findAllByUser(userId)).map(p => p.notificationCategoryCode)).toEqual([CODE, null]);
    expect(await preferenceRepository.deleteCategoryPreference(userId, CODE)).toBe(1);
  });

  it('notificación personal: errores por canal incrementan en la base y las métricas por categoría cuadran', async () => {
    const n = await notificationRepository.create({ userId, notificationTypeId: typeId, title: 'T', body: 'B', processingStatus: 'pending' });
    await notificationRepository.recordPushError(n.notificationId, 'boom', new Date(Date.now() - 1000));
    await notificationRepository.recordPushError(n.notificationId, 'boom', new Date(Date.now() - 1000));
    expect((await notificationRepository.findById(n.notificationId))?.pushRetryCount).toBe(2);
    expect((await notificationRepository.findPendingPushRetries()).map(r => r.notificationId)).toContain(n.notificationId);

    await notificationRepository.markEmailSent(n.notificationId);
    const metrics = await notificationRepository.deliveryMetrics({ userId });
    expect(metrics).toEqual([
      expect.objectContaining({ category_code: CODE, total: 1, push_attempted: 1, push_failed: 1, email_sent: 1, status_pending: 1 })
    ]);

    const admin = await notificationRepository.findAllForAdmin({ userId, channel: 'push', onlyCritical: false });
    expect(admin.count).toBe(1);
    expect(admin.rows[0]?.notificationType?.category).toMatchObject({ code: CODE });

    expect(await notificationRepository.markAsReadByIds([n.notificationId])).toBe(1);
    expect(await notificationRepository.markAsReadByIds([n.notificationId])).toBe(0);
    expect(await notificationRepository.countUnreadByUser(userId)).toBe(0);
  });

  it('global: vigente por defecto (startsAt = ahora), leída una vez aunque se marque dos', async () => {
    const g = await globalNotificationRepository.create({ notificationTypeId: typeId, title: 'G', body: 'B', sendInApp: true, isActive: true });
    expect((await globalNotificationRepository.findUnreadByUser(userId)).map(r => r.globalNotificationId)).toContain(g.globalNotificationId);

    await globalNotificationReadRepository.bulkMarkAsRead([g.globalNotificationId], userId);
    await globalNotificationReadRepository.bulkMarkAsRead([g.globalNotificationId], userId);

    expect(await globalNotificationReadRepository.getReadIdsByUser(userId)).toEqual([g.globalNotificationId]);
    expect((await globalNotificationRepository.findUnreadByUser(userId)).map(r => r.globalNotificationId)).not.toContain(g.globalNotificationId);

    await globalNotificationRepository.incrementPushSentCount(g.globalNotificationId, 5);
    await globalNotificationRepository.incrementPushSentCount(g.globalNotificationId, 2);
    expect((await prisma.globalNotification.findUnique({ where: { globalNotificationId: g.globalNotificationId } }))?.pushSentCount).toBe(7);
  });

  it('código de verificación: rate limit, intentos y verificación', async () => {
    const contact = `${TAG}@test.local`;
    expect(await verificationCodeRepository.canRequestNewCode('email', contact)).toBe(true);
    const vc = await verificationCodeRepository.create({ type: 'email', contactValue: contact, code: '123456', expiresAt: new Date(Date.now() + 60_000) });
    expect(await verificationCodeRepository.canRequestNewCode('email', contact)).toBe(false);

    expect(await verificationCodeRepository.incrementAttempts(vc.verificationCodeId)).toBe(1);
    expect((await verificationCodeRepository.findActiveByContact('email', contact))?.attempts).toBe(1);

    await verificationCodeRepository.markAsVerified(vc.verificationCodeId);
    expect(await verificationCodeRepository.findActiveByContact('email', contact)).toBeNull();
    expect(await verificationCodeRepository.incrementAttempts(vc.verificationCodeId)).toBe(0);
    expect((await verificationCodeRepository.findVerifiedByContact('email', contact))?.verificationCodeId).toBe(vc.verificationCodeId);
  });

  it('suppression list: al tercer rebote duro la dirección queda suprimida; lift la libera', async () => {
    const opts = { errorCode: 'Bounce', threshold: 3 };
    expect(await emailBounceSuppressionRepository.registerHardBounce(TAG, opts)).toMatchObject({ bounceCount: 1, suppressed: false });
    await emailBounceSuppressionRepository.registerHardBounce(TAG, opts);
    expect(await emailBounceSuppressionRepository.registerHardBounce(TAG, opts)).toEqual({ bounceCount: 3, suppressed: true, alreadySuppressed: false });
    expect(await emailBounceSuppressionRepository.isSuppressed(TAG)).toBe(true);

    await emailBounceSuppressionRepository.lift(TAG);
    expect(await emailBounceSuppressionRepository.isSuppressed(TAG)).toBe(false);
  });
});
