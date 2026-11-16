// tests/unit/modules/schemas/notification.regressions.test.js
//
// Regresiones de bugs que destapó el tipado de modules/schemas/notification (fase 4 de la
// migración a TS). Repositorios y modelos se reemplazan por dobles.

jest.mock('shared/models', () => ({}));
jest.mock('shared/utils/logger.util', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  logAudit: jest.fn()
}));
jest.mock('modules/schemas/notification/utils/notification-count.util', () => ({ emitCountUpdate: jest.fn() }));

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-sns', () => {
  const actual = jest.requireActual('@aws-sdk/client-sns');
  return { ...actual, SNSClient: jest.fn().mockImplementation(() => ({ send: mockSend })) };
});

const { PushNotificationService } = require('modules/schemas/notification/services/push-notification.service');
const { NotificationBatchService } = require('modules/schemas/notification/services/notification-batch.service');
const { NotificationCreationService } = require('modules/schemas/notification/services/notification-creation.service');

beforeEach(() => jest.clearAllMocks());

describe('PushNotificationService.registrarDispositivo', () => {
  // Antes usaba this._snsClient (null hasta el primer uso del getter) → en un proceso recién
  // levantado registrar un dispositivo fallaba siempre con 500.
  it('funciona en frío, sin cliente SNS inyectado ni usado antes', async () => {
    mockSend.mockResolvedValue({ EndpointArn: 'arn:aws:sns:endpoint/1' });
    const service = new PushNotificationService();
    Object.defineProperty(service, 'PLATFORM_ARNS', { value: { ios: 'arn:ios', android: 'arn:android' } });

    await expect(service.registrarDispositivo('fcm-token', 'android', 'u-1')).resolves.toBe('arn:aws:sns:endpoint/1');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationBatchService._scheduleCacheCleanup', () => {
  // Antes: cache.del(...).catch(...) con la caché local (síncrona, del() devuelve un número) lanzaba
  // TypeError dentro del timer → uncaughtException → process.exit(1) en producción.
  it('tolera una caché síncrona (sin Redis)', async () => {
    jest.useFakeTimers();
    try {
      const syncCache = { get: jest.fn(), set: jest.fn(), del: jest.fn(() => 1) };
      const service = new NotificationBatchService({});

      service._scheduleCacheCleanup(syncCache, 'g-1');
      expect(() => jest.runOnlyPendingTimers()).not.toThrow();
      await Promise.resolve();
      await Promise.resolve();

      expect(syncCache.del).toHaveBeenCalledWith('global_notif:g-1:batch_state');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('NotificationCreationService: entidad relacionada', () => {
  // Antes se escribía relatedEntity_type / relatedEntity_id: columnas inexistentes que Sequelize
  // descartaba, así que la notificación nunca guardaba a qué entidad apuntaba.
  it('guarda related_entity_type y related_entity_id', async () => {
    const notificationRepo = { create: jest.fn().mockResolvedValue({ notification_id: 'n-1' }) };
    const service = new NotificationCreationService({
      notificationRepo,
      userNotificationPreferenceRepo: { findGlobalByUser: jest.fn().mockResolvedValue(null) },
      notificationSchedulerService: { isInQuietHours: jest.fn(() => false) },
      notificationSendingService: { procesarEnviosIndividuales: jest.fn().mockResolvedValue(undefined) }
    });
    const notificationType = { notification_type_id: 'nt-1', priority: 'normal', category: null };

    await service._crearNotificacionIndividual('u-1', notificationType, 'T', 'B', { type: 'ApprovalRequest', id: 'ar-1' }, {}, null);

    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ related_entity_type: 'ApprovalRequest', related_entity_id: 'ar-1' }),
      { transaction: null }
    );
  });
});
