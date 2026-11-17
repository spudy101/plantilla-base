// tests/unit/modules/schemas/notification/services/notification-batch.service.test.ts
//
// NotificationBatchService — procesamiento de notificaciones globales por lotes (push + email). Se
// prueba la orquestación sin tocar Redis/AWS/BD: (1) procesarNotificacionGlobal en camino feliz
// dispara ambos canales y marca los estados de procesamiento; (2) su rama de error marca los canales
// como failed; (3) el gating por categoría salta el canal no soportado; (4) enviarPushGlobalPorLotes
// corta cuando no hay tokens; (5) enviarEmailGlobalPorLotes descifra emails GCM y cuenta
// éxitos/fallos, y corta cuando no hay usuarios con email; (6) _actualizarEstadoLote refresca el
// estado en cache. Repos, cache, servicios de envío, rate-limit, user-repo, encryption y logger se
// mockean. Se usan fake timers para no dejar colgado el setTimeout de limpieza (1h) ni el sleep
// entre lotes (se mantiene un solo lote por prueba para evitar el sleep).

jest.mock('modules/schemas/notification/repositories/global-notification.repository', () => ({
  update: jest.fn().mockResolvedValue(undefined),
  updatePushProcessingStatus: jest.fn().mockResolvedValue(undefined),
  updateEmailProcessingStatus: jest.fn().mockResolvedValue(undefined),
  incrementPushSentCount: jest.fn().mockResolvedValue(undefined),
  incrementEmailSentCount: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/kyc/person/repositories/user-notification-preference.repository', () => ({
  userAllowsPush: jest.fn().mockResolvedValue(true),
  userAllowsEmail: jest.fn().mockResolvedValue(true)
}));

jest.mock('modules/schemas/notification/repositories/user-push-token.repository', () => ({
  findActiveByUsers: jest.fn().mockResolvedValue([])
}));

// Redis no disponible → el servicio usa el cache local (cache.util), que es el que controlamos.
jest.mock('shared/utils/redis.util', () => ({
  isAvailable: jest.fn().mockReturnValue(false)
}));

jest.mock('shared/utils/cache.util', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/notification/services/email-notification.service', () => ({
  enviarNotificacion: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/notification/services/push-notification.service', () => ({
  enviarPushMasivo: jest.fn().mockResolvedValue({ success: 0, failed: 0 })
}));

jest.mock('modules/schemas/notification/services/notification-rate-limit.service', () => ({
  checkSNSRateLimit: jest.fn().mockResolvedValue(undefined),
  checkSESRateLimit: jest.fn().mockResolvedValue(undefined)
}));

// Requerido de forma perezosa dentro de procesarNotificacionGlobal — igualmente interceptable.
jest.mock('modules/schemas/kyc/iam/repositories/user.repository', () => ({
  findActiveUsersByRoleNamesDetailed: jest.fn().mockResolvedValue([])
}));

// Requerido de forma perezosa dentro de _procesarLoteEmail.
jest.mock('shared/utils/encryption.util', () => ({
  decrypt: jest.fn(value => `dec(${value})`)
}));

jest.mock('shared/utils/logger.util', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('shared/constants', () => ({
  CLIENT_ROLE_NAMES: ['CLIENTE', 'CLIENTE_VERIFICADO']
}));

import { mocked, fixture } from 'tests/helpers/mock';
import globalNotificationRepoModule = require('modules/schemas/notification/repositories/global-notification.repository');
const globalNotificationRepo = mocked(globalNotificationRepoModule);
import preferenceRepoModule = require('modules/schemas/kyc/person/repositories/user-notification-preference.repository');
const preferenceRepo = mocked(preferenceRepoModule);
import pushTokenRepoModule = require('modules/schemas/notification/repositories/user-push-token.repository');
const pushTokenRepo = mocked(pushTokenRepoModule);
import localCacheModule = require('shared/utils/cache.util');
const localCache = mocked(localCacheModule);
import emailServiceModule = require('modules/schemas/notification/services/email-notification.service');
const emailService = mocked(emailServiceModule);
import pushServiceModule = require('modules/schemas/notification/services/push-notification.service');
const pushService = mocked(pushServiceModule);
import rateLimitServiceModule = require('modules/schemas/notification/services/notification-rate-limit.service');
const rateLimitService = mocked(rateLimitServiceModule);
import userRepositoryModule = require('modules/schemas/kyc/iam/repositories/user.repository');
const userRepository = mocked(userRepositoryModule);
import EncryptionUtilModule = require('shared/utils/encryption.util');
const EncryptionUtil = mocked(EncryptionUtilModule);
import loggerUtilModule = require('shared/utils/logger.util');
const { logger } = mocked(loggerUtilModule);
import service = require('modules/schemas/notification/services/notification-batch.service');

const GID = 'g-1';

function pushCategoryType(overrides = {}) {
  return { category: { code: 'CAT', supports_push: true, supports_email: true, ...overrides } };
}

describe('NotificationBatchService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    preferenceRepo.userAllowsPush.mockResolvedValue(true);
    preferenceRepo.userAllowsEmail.mockResolvedValue(true);
    pushTokenRepo.findActiveByUsers.mockResolvedValue([]);
    pushService.enviarPushMasivo.mockResolvedValue({ success: 0, failed: 0 });
    EncryptionUtil.decrypt.mockImplementation(value => `dec(${value})`);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('procesarNotificacionGlobal', () => {
    it('procesa ambos canales, marca estados de procesamiento y guarda el estado de lotes', async () => {
      const users = [{ user_id: 'u-1', person: { contact: { email: 'a@b.cl' } } }];
      userRepository.findActiveUsersByRoleNamesDetailed.mockResolvedValue(users);
      pushTokenRepo.findActiveByUsers.mockResolvedValue([{ token: 'arn-1' }]);
      pushService.enviarPushMasivo.mockResolvedValue({ success: 1, failed: 0 });

      await service.procesarNotificacionGlobal(GID, fixture(pushCategoryType()), 'Título', 'Cuerpo', { x: 1 });

      // Total de usuarios objetivo y arranque del procesamiento.
      expect(globalNotificationRepo.update).toHaveBeenCalledWith(
        GID,
        expect.objectContaining({ total_target_users: 1 })
      );
      // Estados push: processing → completed.
      expect(globalNotificationRepo.updatePushProcessingStatus).toHaveBeenNthCalledWith(1, GID, 'processing');
      expect(globalNotificationRepo.updatePushProcessingStatus).toHaveBeenNthCalledWith(2, GID, 'completed');
      expect(pushService.enviarPushMasivo).toHaveBeenCalledWith(['arn-1'], 'Título', 'Cuerpo', { x: 1 });
      // Estados email: processing → completed y envío del email.
      expect(globalNotificationRepo.updateEmailProcessingStatus).toHaveBeenNthCalledWith(1, GID, 'processing');
      expect(globalNotificationRepo.updateEmailProcessingStatus).toHaveBeenNthCalledWith(2, GID, 'completed');
      expect(emailService.enviarNotificacion).toHaveBeenCalledTimes(1);
      // Cierre del procesamiento y persistencia del estado de lotes.
      expect(globalNotificationRepo.update).toHaveBeenCalledWith(
        GID,
        expect.objectContaining({ processing_completed_at: expect.any(Date) })
      );
      expect(localCache.set).toHaveBeenCalledWith(
        `global_notif:${GID}:batch_state`,
        expect.any(String),
        expect.any(Number)
      );
    });

    it('salta el canal push cuando la categoría no lo soporta', async () => {
      userRepository.findActiveUsersByRoleNamesDetailed.mockResolvedValue([
        { user_id: 'u-1', person: { contact: { email: 'a@b.cl' } } }
      ]);

      await service.procesarNotificacionGlobal(GID, fixture(pushCategoryType({ supports_push: false })), 'T', 'B', {});

      expect(globalNotificationRepo.updatePushProcessingStatus).not.toHaveBeenCalled();
      expect(pushService.enviarPushMasivo).not.toHaveBeenCalled();
      // El email sí se procesa.
      expect(globalNotificationRepo.updateEmailProcessingStatus).toHaveBeenCalled();
    });

    it('marca ambos canales como failed si el procesamiento lanza (rama catch)', async () => {
      userRepository.findActiveUsersByRoleNamesDetailed.mockRejectedValue(new Error('db down'));

      await service.procesarNotificacionGlobal(GID, fixture(pushCategoryType()), 'T', 'B', {});

      expect(logger.warn).toHaveBeenCalledWith('Error en procesamiento global', expect.objectContaining({ error: 'db down' }));
      expect(globalNotificationRepo.update).toHaveBeenCalledWith(
        GID,
        expect.objectContaining({ push_processing_status: 'failed', email_processing_status: 'failed' })
      );
    });
  });

  describe('enviarPushGlobalPorLotes', () => {
    it('corta y avisa cuando no hay tokens activos', async () => {
      pushTokenRepo.findActiveByUsers.mockResolvedValue([]);

      await service.enviarPushGlobalPorLotes(GID, fixture([{ user_id: 'u-1' }]), 'T', 'B', {}, 'CAT', localCache);

      expect(logger.warn).toHaveBeenCalledWith('No hay tokens activos para push global');
      expect(pushService.enviarPushMasivo).not.toHaveBeenCalled();
    });

    it('filtra por preferencia y envía el lote a los tokens de los usuarios permitidos', async () => {
      // u-2 no permite push → se descarta antes de resolver tokens.
      preferenceRepo.userAllowsPush.mockImplementation(userId => Promise.resolve(userId === 'u-1'));
      pushTokenRepo.findActiveByUsers.mockResolvedValue([{ token: 'arn-1' }]);
      pushService.enviarPushMasivo.mockResolvedValue({ success: 1, failed: 0 });

      await service.enviarPushGlobalPorLotes(
        GID,
        fixture([{ user_id: 'u-1' }, { user_id: 'u-2' }]),
        'T',
        'B',
        {},
        'CAT',
        localCache
      );

      expect(pushTokenRepo.findActiveByUsers).toHaveBeenCalledWith(['u-1']);
      expect(rateLimitService.checkSNSRateLimit).toHaveBeenCalledWith(localCache);
      expect(pushService.enviarPushMasivo).toHaveBeenCalledWith(['arn-1'], 'T', 'B', {});
      expect(globalNotificationRepo.incrementPushSentCount).toHaveBeenCalledWith(GID, 1);
    });
  });

  describe('enviarEmailGlobalPorLotes', () => {
    it('descifra el email en formato GCM y deja el email plano tal cual', async () => {
      const users = [
        { user_id: 'u-1', person: { contact: { email: 'iv:tag:cipher' } } }, // 3 partes → GCM
        { user_id: 'u-2', person: { contact: { email: 'plano@b.cl' } } }
      ];

      await service.enviarEmailGlobalPorLotes(GID, fixture(users), fixture({ code: 'WELCOME' }), { m: 1 }, 'CAT', localCache);

      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('iv:tag:cipher');
      expect(emailService.enviarNotificacion).toHaveBeenCalledWith('dec(iv:tag:cipher)', { code: 'WELCOME' }, { m: 1 });
      expect(emailService.enviarNotificacion).toHaveBeenCalledWith('plano@b.cl', { code: 'WELCOME' }, { m: 1 });
      // 2 enviados con éxito.
      expect(globalNotificationRepo.incrementEmailSentCount).toHaveBeenCalledWith(GID, 2);
    });

    it('cuenta como fallido el email cuyo envío rechaza (Promise.allSettled)', async () => {
      emailService.enviarNotificacion.mockRejectedValueOnce(new Error('SES caído'));

      await service.enviarEmailGlobalPorLotes(
        GID,
        fixture([{ user_id: 'u-1', person: { contact: { email: 'a@b.cl' } } }]),
        fixture({ code: 'WELCOME' }),
        {},
        'CAT',
        localCache
      );

      expect(logger.warn).toHaveBeenCalledWith('Error enviando email', expect.objectContaining({ error: 'SES caído' }));
      expect(globalNotificationRepo.incrementEmailSentCount).toHaveBeenCalledWith(GID, 0);
    });

    it('corta y avisa cuando no hay usuarios con email habilitado', async () => {
      preferenceRepo.userAllowsEmail.mockResolvedValue(false);

      await service.enviarEmailGlobalPorLotes(
        GID,
        fixture([{ user_id: 'u-1', person: { contact: { email: 'a@b.cl' } } }]),
        fixture({ code: 'WELCOME' }),
        {},
        'CAT',
        localCache
      );

      expect(logger.warn).toHaveBeenCalledWith('No hay usuarios con email habilitado');
      expect(emailService.enviarNotificacion).not.toHaveBeenCalled();
    });
  });

  describe('_actualizarEstadoLote', () => {
    it('lee el estado desde cache, suma los procesados y lo vuelve a guardar', async () => {
      localCache.get.mockResolvedValue(JSON.stringify({ processed_users: 10, current_batch: 0 }));

      await service._actualizarEstadoLote(localCache, GID, 3, 5);

      const [, savedRaw] = localCache.set.mock.calls[0];
      const saved = JSON.parse(savedRaw);
      expect(saved.processed_users).toBe(15);
      expect(saved.current_batch).toBe(3);
    });

    it('no falla si el cache no tiene estado (no llama set)', async () => {
      localCache.get.mockResolvedValue(null);

      await expect(service._actualizarEstadoLote(localCache, GID, 1, 5)).resolves.toBeUndefined();
      expect(localCache.set).not.toHaveBeenCalled();
    });
  });
});
