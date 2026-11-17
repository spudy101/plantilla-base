// tests/unit/modules/schemas/notification/services/notification-creation.service.test.ts
//
// NotificationCreationService — núcleo del pipeline de creación de notificaciones. Probamos la
// lógica de orquestación, no el acceso a datos: (1) validaciones de entrada (tipo/email requeridos
// y tipo inexistente → AppError 400/404); (2) el envío directo por email descifra el destino y
// delega en el servicio de email; (3) el camino individual crea la fila in-app, resuelve las
// preferencias del usuario por categoría y despacha el envío en background (scheduler de DND +
// prioridad); (4) el camino global crea la fila global y despacha el procesamiento masivo; (5) la
// propagación de errores del repositorio. Repos, utils, servicios de envío/scheduler/batch, logger
// y el modelo se mockean para aislar la lógica; AppError es el real para poder assertar statusCode.

jest.mock('modules/schemas/notification/repositories/notification.repository', () => ({
  create: jest.fn()
}));

jest.mock('modules/schemas/notification/repositories/global-notification.repository', () => ({
  create: jest.fn()
}));

jest.mock('modules/schemas/notification/repositories/notification-type.repository', () => ({
  findByCode: jest.fn()
}));

jest.mock('modules/schemas/kyc/person/repositories/user-notification-preference.repository', () => ({
  findByUserAndCategory: jest.fn(),
  findGlobalByUser: jest.fn()
}));

jest.mock('modules/schemas/notification/utils/notification-count.util', () => ({
  emitCountUpdate: jest.fn(),
  emitGlobalCountInvalidation: jest.fn()
}));

jest.mock('modules/schemas/notification/utils/notification-content.util', () => ({
  generarContenido: jest.fn().mockReturnValue({ title: 'Título generado', body: 'Cuerpo generado' }),
  mapPriority: jest.fn().mockReturnValue('normal')
}));

jest.mock('modules/schemas/notification/services/notification-scheduler.service', () => ({
  isInQuietHours: jest.fn().mockReturnValue(false)
}));

jest.mock('modules/schemas/notification/services/notification-sending.service', () => ({
  procesarEnviosIndividuales: jest.fn().mockResolvedValue(undefined)
}));

// Servicios cargados de forma perezosa (require dentro del método) — igualmente interceptables.
jest.mock('modules/schemas/notification/services/email-notification.service', () => ({
  enviarNotificacion: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/notification/services/notification-batch.service', () => ({
  procesarNotificacionGlobal: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('shared/utils/encryption.util', () => ({
  safeDecrypt: jest.fn(value => `dec(${value})`)
}));

jest.mock('shared/utils/logger.util', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

// El modelo solo aporta la constante de estado de procesamiento que usa el fuente.
jest.mock('shared/models', () => ({}));

import { mocked, fixture } from 'tests/helpers/mock';
import notificationRepoModule from 'modules/schemas/notification/repositories/notification.repository';
const notificationRepo = mocked(notificationRepoModule);
import globalNotificationRepoModule from 'modules/schemas/notification/repositories/global-notification.repository';
const globalNotificationRepo = mocked(globalNotificationRepoModule);
import notificationTypeRepoModule from 'modules/schemas/notification/repositories/notification-type.repository';
const notificationTypeRepo = mocked(notificationTypeRepoModule);
import userPreferenceRepoModule from 'modules/schemas/kyc/person/repositories/user-notification-preference.repository';
const userPreferenceRepo = mocked(userPreferenceRepoModule);
import NotificationCountUtilModule from 'modules/schemas/notification/utils/notification-count.util';
const NotificationCountUtil = mocked(NotificationCountUtilModule);
import NotificationContentUtilModule from 'modules/schemas/notification/utils/notification-content.util';
const NotificationContentUtil = mocked(NotificationContentUtilModule);
import schedulerServiceModule from 'modules/schemas/notification/services/notification-scheduler.service';
const schedulerService = mocked(schedulerServiceModule);
import sendingServiceModule from 'modules/schemas/notification/services/notification-sending.service';
const sendingService = mocked(sendingServiceModule);
import emailServiceModule from 'modules/schemas/notification/services/email-notification.service';
const emailService = mocked(emailServiceModule);
import batchServiceModule from 'modules/schemas/notification/services/notification-batch.service';
const batchService = mocked(batchServiceModule);
import EncryptionUtilModule from 'shared/utils/encryption.util';
const EncryptionUtil = mocked(EncryptionUtilModule);
import creationService from 'modules/schemas/notification/services/notification-creation.service';

// Los envíos/side-effects se agendan con setImmediate; drenamos la cola para observarlos.
const flush = () => new Promise(resolve => { setImmediate(resolve); });

function notificationType(overrides = {}) {
  return {
    notification_type_id: 't-1',
    code: 'WELCOME',
    priority: 'normal',
    category: null,
    ...overrides
  };
}

describe('NotificationCreationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    NotificationContentUtil.generarContenido.mockReturnValue({ title: 'Título generado', body: 'Cuerpo generado' });
    NotificationContentUtil.mapPriority.mockReturnValue('normal');
    schedulerService.isInQuietHours.mockReturnValue(false);
    EncryptionUtil.safeDecrypt.mockImplementation(value => `dec(${value})`);
  });

  describe('crearNotificacionDirecta', () => {
    it('lanza badRequest (400) si falta tipoNotificacion', async () => {
      await expect(creationService.crearNotificacionDirecta(fixture({ email: 'a@b.cl' }))).rejects.toMatchObject({
        statusCode: 400
      });
    });

    it('lanza badRequest (400) si falta email', async () => {
      await expect(creationService.crearNotificacionDirecta(fixture({ tipoNotificacion: 'WELCOME' }))).rejects.toMatchObject({
        statusCode: 400
      });
    });

    it('lanza notFound (404) si el tipo de notificación no existe', async () => {
      notificationTypeRepo.findByCode.mockResolvedValue(null);
      await expect(
        creationService.crearNotificacionDirecta({ tipoNotificacion: 'NOPE', email: 'a@b.cl' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('descifra el email y delega en el servicio de email (camino feliz)', async () => {
      const type = notificationType();
      notificationTypeRepo.findByCode.mockResolvedValue(type);

      const result = await creationService.crearNotificacionDirecta({
        tipoNotificacion: 'WELCOME',
        email: 'iv:tag:cipher',
        metadata: { nombre: 'Ana' }
      });

      expect(EncryptionUtil.safeDecrypt).toHaveBeenCalledWith('iv:tag:cipher');
      expect(emailService.enviarNotificacion).toHaveBeenCalledWith('dec(iv:tag:cipher)', type, { nombre: 'Ana' });
      expect(result).toEqual({ estado_solicitud: 1, message: expect.any(String) });
    });

    it('propaga el error si el servicio de email falla', async () => {
      notificationTypeRepo.findByCode.mockResolvedValue(notificationType());
      emailService.enviarNotificacion.mockRejectedValueOnce(new Error('SES caído'));

      await expect(
        creationService.crearNotificacionDirecta({ tipoNotificacion: 'WELCOME', email: 'a@b.cl' })
      ).rejects.toThrow('SES caído');
    });
  });

  describe('crearNotificacion', () => {
    it('lanza badRequest (400) si falta tipoNotificacion', async () => {
      await expect(creationService.crearNotificacion(fixture({ userId: 'u-1' }))).rejects.toMatchObject({ statusCode: 400 });
    });

    it('lanza notFound (404) si el tipo de notificación no existe', async () => {
      notificationTypeRepo.findByCode.mockResolvedValue(null);
      await expect(
        creationService.crearNotificacion({ tipoNotificacion: 'NOPE', userId: 'u-1' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    describe('individual (userId presente)', () => {
      it('crea la notificación in-app, despacha el envío y devuelve notification_id', async () => {
        notificationTypeRepo.findByCode.mockResolvedValue(notificationType());
        notificationRepo.create.mockResolvedValue({ notification_id: 'n-1' });
        userPreferenceRepo.findGlobalByUser.mockResolvedValue({ user_id: 'u-1' });

        const result = await creationService.crearNotificacion({
          tipoNotificacion: 'WELCOME',
          userId: 'u-1',
          metadata: { foo: 'bar' }
        });

        // Sin categoría → preferencia global.
        expect(userPreferenceRepo.findGlobalByUser).toHaveBeenCalledWith('u-1');
        expect(userPreferenceRepo.findByUserAndCategory).not.toHaveBeenCalled();
        expect(notificationRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            user_id: 'u-1',
            notification_type_id: 't-1',
            processing_status: 'pending'
          }),
          { transaction: null }
        );
        expect(result).toMatchObject({ estado_solicitud: 1, notification_id: 'n-1' });

        // El envío en background y el refresco del contador se agendan con setImmediate.
        await flush();
        expect(sendingService.procesarEnviosIndividuales).toHaveBeenCalledTimes(1);
        expect(NotificationCountUtil.emitCountUpdate).toHaveBeenCalledWith('u-1');
      });

      it('resuelve la preferencia por categoría cuando el tipo tiene categoría', async () => {
        const type = notificationType({ category: { code: 'SECURITY', allow_dnd: true, is_critical: false } });
        notificationTypeRepo.findByCode.mockResolvedValue(type);
        notificationRepo.create.mockResolvedValue({ notification_id: 'n-2' });
        userPreferenceRepo.findByUserAndCategory.mockResolvedValue({ user_id: 'u-1' });

        await creationService.crearNotificacion({ tipoNotificacion: 'LOGIN', userId: 'u-1' });
        await flush(); // drena el envío en background para no filtrarlo al siguiente test

        expect(userPreferenceRepo.findByUserAndCategory).toHaveBeenCalledWith('u-1', 'SECURITY');
        expect(userPreferenceRepo.findGlobalByUser).not.toHaveBeenCalled();
      });

      it('aplica quiet hours (DND) cuando la categoría lo permite y no es crítica', async () => {
        const type = notificationType({ category: { code: 'MARKETING', allow_dnd: true, is_critical: false } });
        notificationTypeRepo.findByCode.mockResolvedValue(type);
        notificationRepo.create.mockResolvedValue({ notification_id: 'n-3' });
        userPreferenceRepo.findByUserAndCategory.mockResolvedValue({ user_id: 'u-1', dnd: true });
        schedulerService.isInQuietHours.mockReturnValue(true);

        await creationService.crearNotificacion({ tipoNotificacion: 'PROMO', userId: 'u-1' });
        await flush();

        // isQuietHours (arg #8) debe ir en true, isHighPriority (arg #9) en false.
        const call = sendingService.procesarEnviosIndividuales.mock.calls[0];
        expect(call[7]).toBe(true);
        expect(call[8]).toBe(false);
      });

      it('una categoría crítica ignora el quiet hours y marca alta prioridad', async () => {
        const type = notificationType({ category: { code: 'SECURITY', allow_dnd: true, is_critical: true } });
        notificationTypeRepo.findByCode.mockResolvedValue(type);
        notificationRepo.create.mockResolvedValue({ notification_id: 'n-4' });
        userPreferenceRepo.findByUserAndCategory.mockResolvedValue({ user_id: 'u-1' });
        schedulerService.isInQuietHours.mockReturnValue(true);

        await creationService.crearNotificacion({ tipoNotificacion: 'ALERT', userId: 'u-1' });
        await flush();

        const call = sendingService.procesarEnviosIndividuales.mock.calls[0];
        expect(call[7]).toBe(false); // crítica → nunca en quiet hours
        expect(call[8]).toBe(true); // crítica → alta prioridad
      });

      it('propaga el error si el repositorio de notificaciones falla', async () => {
        notificationTypeRepo.findByCode.mockResolvedValue(notificationType());
        notificationRepo.create.mockRejectedValue(new Error('db down'));

        await expect(
          creationService.crearNotificacion({ tipoNotificacion: 'WELCOME', userId: 'u-1' })
        ).rejects.toThrow('db down');
      });
    });

    describe('global (userId ausente)', () => {
      it('crea la notificación global, despacha el batch y devuelve global_notification_id', async () => {
        const type = notificationType({ category: { supports_push: true, supports_email: false } });
        notificationTypeRepo.findByCode.mockResolvedValue(type);
        globalNotificationRepo.create.mockResolvedValue({ global_notification_id: 'g-1' });

        const result = await creationService.crearNotificacion({ tipoNotificacion: 'BROADCAST', metadata: { x: 1 } });

        expect(globalNotificationRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            notification_type_id: 't-1',
            send_push: true,
            send_email: false,
            send_in_app: true
          }),
          { transaction: null }
        );
        expect(result).toMatchObject({ estado_solicitud: 1, global_notification_id: 'g-1' });

        await flush();
        expect(batchService.procesarNotificacionGlobal).toHaveBeenCalledTimes(1);
        expect(NotificationCountUtil.emitGlobalCountInvalidation).toHaveBeenCalled();
      });

      it('propaga el error si el repositorio global falla', async () => {
        notificationTypeRepo.findByCode.mockResolvedValue(notificationType());
        globalNotificationRepo.create.mockRejectedValue(new Error('db down'));

        await expect(creationService.crearNotificacion({ tipoNotificacion: 'BROADCAST' })).rejects.toThrow('db down');
      });
    });
  });
});
