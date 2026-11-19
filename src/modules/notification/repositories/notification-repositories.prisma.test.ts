// tests/unit/modules/schemas/notification/repositories/notification-repositories.prisma.test.ts
//
// Repositorios del grupo 3 (notificaciones) sobre Prisma (docs/prisma-migration.md, fase 5): se mockea
// el cliente único y se verifica que arman las consultas con los campos de Prisma. Incluye las
// regresiones que antes cubrían los tests de Sequelize (upsertToken sin await, markAsReadByIds solo
// sobre las no leídas, ventana de countFailedBetween) y la conversión de las columnas TIME.

const mockDb = {
  $transaction: jest.fn(),
  userPushToken: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  notification: { updateMany: jest.fn(), updateManyAndReturn: jest.fn() },
  smsDeliveryAttempt: { count: jest.fn() },
  verificationCode: { updateMany: jest.fn() },
  userNotificationPreference: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn(), findMany: jest.fn() },
  emailBounceSuppression: { upsert: jest.fn(), update: jest.fn() }
};

jest.mock('../../../shared/database/prisma', () => mockDb);

import userPushTokenRepository from './user-push-token.repository';
import notificationRepository from './notification.repository';
import smsDeliveryAttemptRepository from './sms-delivery-attempt.repository';
import verificationCodeRepository from './verification-code.repository';
import userNotificationPreferenceRepository from './user-notification-preference.repository';
import emailBounceSuppressionRepository from './email-bounce-suppression.repository';
import { fromTime, toTime } from '../../../shared/database/prisma-time';

beforeEach(() => {
  jest.clearAllMocks();
  // Fuera de una unidad de trabajo, `atomic()` abre su propia transacción con el mismo cliente
  mockDb.$transaction.mockImplementation((fn: (tx: typeof mockDb) => unknown) => fn(mockDb));
});

describe('UserPushTokenRepository.upsertToken', () => {
  it('reasigna y reactiva el token existente del dispositivo', async () => {
    mockDb.userPushToken.findFirst.mockResolvedValueOnce({ userPushTokenId: 't-1' });
    mockDb.userPushToken.update.mockResolvedValue('updated');

    await expect(userPushTokenRepository.upsertToken('u-1', 'arn:token', 'android', 'dev-1')).resolves.toBe('updated');

    expect(mockDb.userPushToken.findFirst).toHaveBeenCalledWith({ where: { deviceId: 'dev-1' } });
    expect(mockDb.userPushToken.update).toHaveBeenCalledWith({
      where: { userPushTokenId: 't-1' },
      data: expect.objectContaining({ userId: 'u-1', token: 'arn:token', deviceId: 'dev-1', isActive: true })
    });
    expect(mockDb.userPushToken.create).not.toHaveBeenCalled();
  });

  it('cae a la búsqueda por token y, si no hay registro, crea uno nuevo', async () => {
    mockDb.userPushToken.findFirst.mockResolvedValue(null);
    mockDb.userPushToken.create.mockResolvedValue('created');

    await expect(userPushTokenRepository.upsertToken('u-1', 'arn:token', 'ios', 'dev-1')).resolves.toBe('created');

    expect(mockDb.userPushToken.findFirst).toHaveBeenCalledTimes(2);
    expect(mockDb.userPushToken.findFirst).toHaveBeenLastCalledWith({ where: { token: 'arn:token' } });
    expect(mockDb.userPushToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u-1', token: 'arn:token', platform: 'ios', isActive: true })
    });
  });
});

describe('NotificationRepository', () => {
  it('markAsReadByIds marca como leídas solo las no leídas de los IDs indicados', async () => {
    mockDb.notification.updateMany.mockResolvedValue({ count: 1 });

    await expect(notificationRepository.markAsReadByIds(['n-1', 'n-2'])).resolves.toBe(1);

    expect(mockDb.notification.updateMany).toHaveBeenCalledWith({
      where: { notificationId: { in: ['n-1', 'n-2'] }, isRead: false },
      data: { isRead: true, readAt: expect.any(Date) }
    });
  });

  it('recordPushError incrementa el contador en la base (sin leer antes)', async () => {
    mockDb.notification.updateManyAndReturn.mockResolvedValue([{ notificationId: 'n-1' }]);

    await notificationRepository.recordPushError('n-1', 'boom');

    expect(mockDb.notification.updateManyAndReturn).toHaveBeenCalledWith({
      where: { notificationId: 'n-1' },
      data: { pushError: 'boom', pushErrorCode: null, pushRetryCount: { increment: 1 }, pushNextRetryAt: expect.any(Date) }
    });
  });

  it('recordEmailError guarda el código del proveedor junto al mensaje', async () => {
    mockDb.notification.updateManyAndReturn.mockResolvedValue([{ notificationId: 'n-1' }]);

    await notificationRepository.recordEmailError('n-1', 'rechazado', null, 'MessageRejected');

    expect(mockDb.notification.updateManyAndReturn).toHaveBeenCalledWith({
      where: { notificationId: 'n-1' },
      data: expect.objectContaining({ emailError: 'rechazado', emailErrorCode: 'MessageRejected' })
    });
  });

  it('update devuelve null si la fila ya no existe', async () => {
    mockDb.notification.updateManyAndReturn.mockResolvedValue([]);
    await expect(notificationRepository.updateProcessingStatus('n-x', 'failed')).resolves.toBeNull();
  });
});

describe('SmsDeliveryAttemptRepository.countFailedBetween', () => {
  it('con inicio cuenta en la ventana; sin inicio, todo hasta el fin', async () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-01-01T01:00:00Z');
    mockDb.smsDeliveryAttempt.count.mockResolvedValue(2);

    await expect(smsDeliveryAttemptRepository.countFailedBetween(from, to)).resolves.toBe(2);
    expect(mockDb.smsDeliveryAttempt.count).toHaveBeenLastCalledWith({ where: { status: 'failed', createdAt: { gte: from, lte: to } } });

    await smsDeliveryAttemptRepository.countFailedBetween(null, to);
    expect(mockDb.smsDeliveryAttempt.count).toHaveBeenLastCalledWith({ where: { status: 'failed', createdAt: { lte: to } } });
  });
});

describe('VerificationCodeRepository.incrementAttempts', () => {
  it('solo suma sobre un código vigente y sin verificar, en la base', async () => {
    mockDb.verificationCode.updateMany.mockResolvedValue({ count: 1 });

    await expect(verificationCodeRepository.incrementAttempts('vc-1')).resolves.toBe(1);

    expect(mockDb.verificationCode.updateMany).toHaveBeenCalledWith({
      where: { verificationCodeId: 'vc-1', verifiedAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { attempts: { increment: 1 } }
    });
  });
});

describe('UserNotificationPreferenceRepository (horario de no molestar como texto)', () => {
  it('devuelve las horas TIME como "HH:MM:SS"', async () => {
    mockDb.userNotificationPreference.findFirst.mockResolvedValue({
      userNotificationPreferenceId: 'p-1',
      quietHoursStart: toTime('22:00'),
      quietHoursEnd: toTime('07:30:00')
    });

    const pref = await userNotificationPreferenceRepository.findGlobalByUser('u-1');

    expect(pref).toMatchObject({ quietHoursStart: '22:00:00', quietHoursEnd: '07:30:00' });
    expect(mockDb.userNotificationPreference.findFirst).toHaveBeenCalledWith({ where: { userId: 'u-1', notificationCategoryCode: null } });
  });

  it('findByUserAndCategory cae a la global si la categoría no tiene override', async () => {
    mockDb.userNotificationPreference.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ userNotificationPreferenceId: 'g' });

    await expect(userNotificationPreferenceRepository.findByUserAndCategory('u-1', 'SECURITY')).resolves.toMatchObject({
      userNotificationPreferenceId: 'g'
    });
    expect(mockDb.userNotificationPreference.findFirst).toHaveBeenLastCalledWith({ where: { userId: 'u-1', notificationCategoryCode: null } });
  });

  it('upsertGlobalPreference crea la global si no existe y convierte las horas', async () => {
    mockDb.userNotificationPreference.findFirst.mockResolvedValue(null);
    mockDb.userNotificationPreference.create.mockResolvedValue({ userNotificationPreferenceId: 'p-9', quietHoursStart: null, quietHoursEnd: null });

    await userNotificationPreferenceRepository.upsertGlobalPreference('u-1', { allowSms: false, quietHoursStart: '23:15' });

    expect(mockDb.userNotificationPreference.create).toHaveBeenCalledWith({
      data: { userId: 'u-1', notificationCategoryCode: null, allowSms: false, quietHoursStart: toTime('23:15') }
    });
  });

  it('upsertCategoryPreference actualiza el override existente sin tocar lo que no vino', async () => {
    mockDb.userNotificationPreference.findFirst.mockResolvedValue({ userNotificationPreferenceId: 'p-2' });
    mockDb.userNotificationPreference.update.mockResolvedValue({ userNotificationPreferenceId: 'p-2', quietHoursStart: null, quietHoursEnd: null });

    await userNotificationPreferenceRepository.upsertCategoryPreference('u-1', 'MARKETING', { allowPush: false });

    expect(mockDb.userNotificationPreference.update).toHaveBeenCalledWith({ where: { userNotificationPreferenceId: 'p-2' }, data: { allowPush: false } });
  });
});

describe('prisma-time', () => {
  it('ida y vuelta entre "HH:MM[:SS]" y TIME', () => {
    expect(fromTime(toTime('8:05'))).toBe('08:05:00');
    expect(fromTime(toTime('23:59:59'))).toBe('23:59:59');
    expect(toTime(null)).toBeNull();
    expect(toTime('')).toBeNull();
    expect(fromTime(null)).toBeNull();
    expect(() => toTime('25h')).toThrow(/Hora inválida/);
  });
});

describe('EmailBounceSuppressionRepository.registerHardBounce', () => {
  it('suma el rebote en la base y al llegar al umbral marca la dirección como suprimida', async () => {
    mockDb.emailBounceSuppression.upsert.mockResolvedValue({});
    mockDb.emailBounceSuppression.update
      .mockResolvedValueOnce({ bounceCount: 3, status: 'active', userId: null, suppressedAt: null })
      .mockResolvedValueOnce({});

    const result = await emailBounceSuppressionRepository.registerHardBounce('h-1', { userId: 'u-1', errorCode: 'Bounce', threshold: 3 });

    expect(result).toEqual({ bounceCount: 3, suppressed: true, alreadySuppressed: false });
    expect(mockDb.emailBounceSuppression.update).toHaveBeenNthCalledWith(1, { where: { emailHash: 'h-1' }, data: { bounceCount: { increment: 1 } } });
    expect(mockDb.emailBounceSuppression.update).toHaveBeenLastCalledWith({
      where: { emailHash: 'h-1' },
      data: expect.objectContaining({ userId: 'u-1', status: 'suppressed', suppressedAt: expect.any(Date), lastErrorCode: 'Bounce' })
    });
  });
});
