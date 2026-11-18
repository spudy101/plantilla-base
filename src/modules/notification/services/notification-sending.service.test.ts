// tests/unit/modules/schemas/notification/services/notification-sending.service.test.ts
//
// NotificationSendingService — despacho por canal (push/email/sms) con manejo de errores tolerante:
// un canal que falla NO aborta a los demás y el estado final se deriva de los flags reales del
// registro. Probamos: la máquina de estados de entrega (_resolverEstadoEntrega: completed /
// partial_failure / failed / completed-sin-intentos), el ruteo por categoría+preferencias y quiet
// hours (enviar vs programar), y cada envío individual (éxito → markSent, fallo → recordError +
// auditoría, destino ausente → no-op). Repos, servicios de canal, scheduler y modelos se mockean.

jest.mock('../repositories/notification.repository', () => ({
  findById: jest.fn(),
  updateProcessingStatus: jest.fn().mockResolvedValue(undefined),
  markPushSent: jest.fn().mockResolvedValue(undefined),
  recordPushError: jest.fn().mockResolvedValue(undefined),
  markEmailSent: jest.fn().mockResolvedValue(undefined),
  recordEmailError: jest.fn().mockResolvedValue(undefined),
  markSmsSent: jest.fn().mockResolvedValue(undefined),
  recordSmsError: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../repositories/notification-type.repository', () => ({ findById: jest.fn() }));
jest.mock('../../iam/repositories/user.repository', () => ({ findById: jest.fn() }));
jest.mock('../repositories/user-push-token.repository', () => ({ findActiveByUser: jest.fn() }));

jest.mock('./email-notification.service', () => ({ enviarNotificacion: jest.fn().mockResolvedValue(undefined) }));
jest.mock('./push-notification.service', () => ({ enviarPushIndividual: jest.fn() }));
jest.mock('./sms.service', () => ({
  resolveE164: jest.fn().mockResolvedValue('+56911112222'),
  enviarSms: jest.fn()
}));
jest.mock('./notification-scheduler.service', () => ({
  programarEnvioPush: jest.fn().mockResolvedValue(undefined),
  programarEnvioEmail: jest.fn().mockResolvedValue(undefined),
  programarEnvioSms: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../../shared/security/encryption.util', () => ({ safeDecrypt: jest.fn(v => v) }));


jest.mock('../../../shared/observability/logger.util', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
  logAudit: jest.fn()
}));
jest.mock('../../audit/audit.service', () => ({ record: jest.fn() }));

import { mocked, Loose, fixture } from 'tests/helpers/mock';
import notificationRepoModule from '../repositories/notification.repository';
const notificationRepo = mocked(notificationRepoModule);
import notificationTypeRepoModule from '../repositories/notification-type.repository';
const notificationTypeRepo = mocked(notificationTypeRepoModule);
import userRepoModule from '../../iam/repositories/user.repository';
const userRepo = mocked(userRepoModule);
import userPushTokenRepoModule from '../repositories/user-push-token.repository';
const userPushTokenRepo = mocked(userPushTokenRepoModule);
import emailServiceModule from './email-notification.service';
const emailService = mocked(emailServiceModule);
import pushServiceModule from './push-notification.service';
const pushService = mocked(pushServiceModule);
import smsServiceModule from './sms.service';
const smsService = mocked(smsServiceModule);
import schedulerServiceModule from './notification-scheduler.service';
const schedulerService = mocked(schedulerServiceModule);
import auditServiceModule from '../../audit/audit.service';
const logAudit = mocked(auditServiceModule).record;
import sending from './notification-sending.service';

const NID = 'notif-1';
const UID = 'user-1';
const ALL_CHANNELS = { category: { supportsPush: true, supportsEmail: true, supportsSms: true } };

describe('NotificationSendingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('_resolverEstadoEntrega', () => {
    const type = { category: { supportsPush: true, supportsEmail: true, supportsSms: false } };

    it('todos los canales intentados entregados → completed', () => {
      const n = { pushSent: true, pushError: null, emailSent: true, emailError: null };
      expect(sending._resolverEstadoEntrega(fixture(n), fixture(type))).toBe('completed');
    });

    it('uno entregado y uno fallido → partial_failure', () => {
      const n = { pushSent: true, pushError: null, emailSent: false, emailError: 'boom' };
      expect(sending._resolverEstadoEntrega(fixture(n), fixture(type))).toBe('partial_failure');
    });

    it('todos los canales intentados fallidos → failed', () => {
      const n = { pushSent: false, pushError: 'x', emailSent: false, emailError: 'y' };
      expect(sending._resolverEstadoEntrega(fixture(n), fixture(type))).toBe('failed');
    });

    it('ningún canal intentado (diferido/sin destino) → completed', () => {
      const n = { pushSent: false, pushError: null, emailSent: false, emailError: null };
      expect(sending._resolverEstadoEntrega(fixture(n), fixture(type))).toBe('completed');
    });
  });

  describe('actualizarEstadoEntrega', () => {
    it('devuelve null si la notificación no existe', async () => {
      notificationRepo.findById.mockResolvedValue(null);
      await expect(sending.actualizarEstadoEntrega(NID, fixture(ALL_CHANNELS))).resolves.toBeNull();
      expect(notificationRepo.updateProcessingStatus).not.toHaveBeenCalled();
    });

    it('persiste el estado resuelto', async () => {
      notificationRepo.findById.mockResolvedValue({ pushSent: true, emailSent: true });
      const status = await sending.actualizarEstadoEntrega(NID, fixture(ALL_CHANNELS));
      expect(status).toBe('completed');
      expect(notificationRepo.updateProcessingStatus).toHaveBeenCalledWith(NID, 'completed');
    });
  });

  describe('procesarEnviosIndividuales — ruteo por canal/quiet hours', () => {
    let pushSpy: Loose, emailSpy: Loose, smsSpy: Loose, estadoSpy: Loose;

    beforeEach(() => {
      pushSpy = jest.spyOn(sending, 'enviarPushIndividual').mockResolvedValue(undefined);
      emailSpy = jest.spyOn(sending, 'enviarEmailIndividual').mockResolvedValue(undefined);
      smsSpy = jest.spyOn(sending, 'enviarSmsIndividual').mockResolvedValue(undefined);
      estadoSpy = jest.spyOn(sending, 'actualizarEstadoEntrega').mockResolvedValue('completed');
    });

    afterEach(() => {
      pushSpy.mockRestore();
      emailSpy.mockRestore();
      smsSpy.mockRestore();
      estadoSpy.mockRestore();
    });

    it('fuera de quiet hours envía por todos los canales soportados', async () => {
      await sending.procesarEnviosIndividuales(NID, UID, fixture(ALL_CHANNELS), 't', 'b', {}, {}, false, false);

      expect(pushSpy).toHaveBeenCalled();
      expect(emailSpy).toHaveBeenCalled();
      expect(smsSpy).toHaveBeenCalled();
      expect(schedulerService.programarEnvioPush).not.toHaveBeenCalled();
      expect(estadoSpy).toHaveBeenCalledWith(NID, ALL_CHANNELS);
    });

    it('en quiet hours (baja prioridad) programa en vez de enviar', async () => {
      await sending.procesarEnviosIndividuales(NID, UID, fixture(ALL_CHANNELS), 't', 'b', {}, {}, true, false);

      expect(pushSpy).not.toHaveBeenCalled();
      expect(schedulerService.programarEnvioPush).toHaveBeenCalled();
      expect(schedulerService.programarEnvioEmail).toHaveBeenCalled();
      expect(schedulerService.programarEnvioSms).toHaveBeenCalled();
    });

    it('en quiet hours pero alta prioridad envía igual', async () => {
      await sending.procesarEnviosIndividuales(NID, UID, fixture(ALL_CHANNELS), 't', 'b', {}, {}, true, true);

      expect(pushSpy).toHaveBeenCalled();
      expect(schedulerService.programarEnvioPush).not.toHaveBeenCalled();
    });

    it('respeta que la categoría no soporte SMS (default) y la preferencia que desactiva push', async () => {
      const type = { category: { supportsPush: true, supportsEmail: true } }; // supports_sms ausente → false
      const pref = { allowPush: false, allowEmail: true, allowSms: true };

      await sending.procesarEnviosIndividuales(NID, UID, fixture(type), 't', 'b', {}, pref, false, false);

      expect(pushSpy).not.toHaveBeenCalled(); // pref.allowPush=false
      expect(emailSpy).toHaveBeenCalled();
      expect(smsSpy).not.toHaveBeenCalled(); // categoría no soporta SMS
    });

    it('ante un fallo marca la notificación como FAILED', async () => {
      pushSpy.mockRejectedValue(new Error('boom'));

      await sending.procesarEnviosIndividuales(NID, UID, fixture(ALL_CHANNELS), 't', 'b', {}, {}, false, false);

      expect(notificationRepo.updateProcessingStatus).toHaveBeenCalledWith(NID, 'failed');
    });
  });

  describe('enviarPushIndividual', () => {
    it('sin tokens activos no marca nada', async () => {
      userPushTokenRepo.findActiveByUser.mockResolvedValue([]);
      await sending.enviarPushIndividual(UID, 't', 'b', {}, NID);
      expect(notificationRepo.markPushSent).not.toHaveBeenCalled();
      expect(notificationRepo.recordPushError).not.toHaveBeenCalled();
    });

    it('con al menos un envío exitoso marca push enviado', async () => {
      userPushTokenRepo.findActiveByUser.mockResolvedValue([{ token: 'tok-abc-1234567890' }]);
      pushService.enviarPushIndividual.mockResolvedValue({ MessageId: 'm-1' });

      await sending.enviarPushIndividual(UID, 't', 'b', {}, NID);

      expect(notificationRepo.markPushSent).toHaveBeenCalledWith(NID);
      expect(notificationRepo.recordPushError).not.toHaveBeenCalled();
    });

    it('si todos los tokens fallan registra error y audita', async () => {
      userPushTokenRepo.findActiveByUser.mockResolvedValue([{ token: 'tok-abc-1234567890' }]);
      pushService.enviarPushIndividual.mockResolvedValue(null); // el push service devuelve null al fallar

      await sending.enviarPushIndividual(UID, 't', 'b', {}, NID);

      expect(notificationRepo.recordPushError).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith('PUSH_DELIVERY_FAILED', expect.objectContaining({ actorId: null }));
    });
  });

  describe('enviarEmailIndividual', () => {
    const type = { notificationTypeId: 't-1' };

    it('usa metadata.email (descifrado) y marca email enviado', async () => {
      await sending.enviarEmailIndividual(UID, fixture(type), { email: 'a@b.com' }, NID);

      expect(userRepo.findById).not.toHaveBeenCalled();
      expect(emailService.enviarNotificacion).toHaveBeenCalledWith('a@b.com', type, { email: 'a@b.com' }, NID);
      expect(notificationRepo.markEmailSent).toHaveBeenCalledWith(NID);
    });

    it('sin email en metadata ni contacto no envía', async () => {
      userRepo.findById.mockResolvedValue({ person: { contact: {} } });
      await sending.enviarEmailIndividual(UID, fixture(type), {}, NID);
      expect(emailService.enviarNotificacion).not.toHaveBeenCalled();
    });

    it('si el envío falla registra error y audita', async () => {
      emailService.enviarNotificacion.mockRejectedValueOnce(new Error('SES down'));
      await sending.enviarEmailIndividual(UID, fixture(type), { email: 'a@b.com' }, NID);
      expect(notificationRepo.recordEmailError).toHaveBeenCalledWith(NID, 'SES down');
      expect(logAudit).toHaveBeenCalledWith('EMAIL_DELIVERY_FAILED', expect.objectContaining({ actorId: null }));
    });
  });

  describe('enviarSmsIndividual', () => {
    it('usa metadata.phone, recorta a 160 y marca SMS enviado en éxito', async () => {
      smsService.enviarSms.mockResolvedValue({ success: true });
      const longBody = 'x'.repeat(200);

      await sending.enviarSmsIndividual(UID, longBody, { phone: '911112222', phonePrefixId: 'pref-1' }, NID);

      expect(smsService.resolveE164).toHaveBeenCalledWith('911112222', 'pref-1');
      expect(smsService.enviarSms).toHaveBeenCalledWith(expect.objectContaining({ message: 'x'.repeat(160) }));
      expect(notificationRepo.markSmsSent).toHaveBeenCalledWith(NID);
    });

    it('si el resultado no es exitoso registra error y audita', async () => {
      smsService.enviarSms.mockResolvedValue({ success: false, error: 'circuito abierto' });
      await sending.enviarSmsIndividual(UID, 'hola', { phone: '911112222' }, NID);
      expect(notificationRepo.recordSmsError).toHaveBeenCalledWith(NID, 'circuito abierto');
      expect(logAudit).toHaveBeenCalledWith('SMS_DELIVERY_FAILED', expect.objectContaining({ actorId: null }));
    });

    it('sin teléfono en metadata ni contacto no envía', async () => {
      userRepo.findById.mockResolvedValue({ person: { contact: {} } });
      await sending.enviarSmsIndividual(UID, 'hola', {}, NID);
      expect(smsService.enviarSms).not.toHaveBeenCalled();
    });
  });

  describe('procesarNotificacionProgramada', () => {
    it('marca PROCESSING y aborta si el tipo no existe', async () => {
      notificationTypeRepo.findById.mockResolvedValue(null);

      await sending.procesarNotificacionProgramada(fixture({ notificationId: NID, notificationTypeId: 't-x' }));

      expect(notificationRepo.updateProcessingStatus).toHaveBeenCalledWith(NID, 'processing');
      // No se resuelve estado final porque no hay tipo.
      expect(notificationRepo.findById).not.toHaveBeenCalled();
    });

    it('despacha solo los canales aún no enviados y resuelve el estado', async () => {
      notificationTypeRepo.findById.mockResolvedValue(ALL_CHANNELS);
      const pushSpy = jest.spyOn(sending, 'enviarPushIndividual').mockResolvedValue(undefined);
      const emailSpy = jest.spyOn(sending, 'enviarEmailIndividual').mockResolvedValue(undefined);
      const smsSpy = jest.spyOn(sending, 'enviarSmsIndividual').mockResolvedValue(undefined);
      const estadoSpy = jest.spyOn(sending, 'actualizarEstadoEntrega').mockResolvedValue('completed');

      await sending.procesarNotificacionProgramada(fixture({
        notificationId: NID,
        notificationTypeId: 't-1',
        userId: UID,
        title: 't',
        body: 'b',
        metadata: {},
        pushSent: true, // ya enviado → no se reintenta
        emailSent: false,
        smsSent: false
      }));

      expect(pushSpy).not.toHaveBeenCalled();
      expect(emailSpy).toHaveBeenCalled();
      expect(smsSpy).toHaveBeenCalled();
      expect(estadoSpy).toHaveBeenCalledWith(NID, ALL_CHANNELS);

      pushSpy.mockRestore();
      emailSpy.mockRestore();
      smsSpy.mockRestore();
      estadoSpy.mockRestore();
    });
  });
});

// ============================================================
// SOLID (O/D): canales extensibles e inyección de dependencias
// ============================================================
// Agregar un canal nuevo (ej. WhatsApp) no requiere modificar el service: se inyecta un
// descriptor más. Y gracias a la inyección por constructor se prueba con fakes en memoria,
// sin jest.mock de módulos.
describe('NotificationSendingService — canales extensibles (Open/Closed)', () => {
  const { NotificationSendingService } = sending;

  const makeFakeRepo = (notification: Loose) => ({
    findById: jest.fn().mockResolvedValue(notification),
    updateProcessingStatus: jest.fn().mockResolvedValue(undefined)
  });

  const whatsappChannel = () => ({
    key: 'whatsapp',
    supportedByDefault: false,
    send: jest.fn().mockResolvedValue(undefined),
    schedule: jest.fn().mockResolvedValue(undefined)
  });

  it('envía por un canal nuevo inyectado cuando la categoría y la preferencia lo permiten', async () => {
    const whatsapp = whatsappChannel();
    const repo = makeFakeRepo({ whatsappSent: true, whatsappError: null });
    const service = new NotificationSendingService(fixture({ notificationRepo: repo, channels: [whatsapp] }));
    const type = { category: { supportsWhatsapp: true } };

    await service.procesarEnviosIndividuales(NID, UID, fixture(type), 'T', 'B', {}, fixture({ allowWhatsapp: true }), false, false);

    expect(whatsapp.send).toHaveBeenCalledWith(expect.objectContaining({ notificationId: NID, userId: UID, body: 'B' }));
    expect(whatsapp.schedule).not.toHaveBeenCalled();
    expect(repo.updateProcessingStatus).toHaveBeenCalledWith(NID, 'completed');
  });

  it('respeta quiet hours también para el canal nuevo (programa en vez de enviar)', async () => {
    const whatsapp = whatsappChannel();
    const service = new NotificationSendingService(fixture({ notificationRepo: makeFakeRepo({}), channels: [whatsapp] }));

    await service.procesarEnviosIndividuales(NID, UID, fixture({ category: { supportsWhatsapp: true } }), 'T', 'B', {}, {}, true, false);

    expect(whatsapp.schedule).toHaveBeenCalled();
    expect(whatsapp.send).not.toHaveBeenCalled();
  });

  it('no usa el canal si la categoría no lo declara y su default es false', async () => {
    const whatsapp = whatsappChannel();
    const service = new NotificationSendingService(fixture({ notificationRepo: makeFakeRepo({}), channels: [whatsapp] }));

    await service.procesarEnviosIndividuales(NID, UID, fixture({ category: {} }), 'T', 'B', {}, {}, false, false);

    expect(whatsapp.send).not.toHaveBeenCalled();
  });

  it('el estado de entrega considera los flags <canal>_sent / <canal>_error del canal nuevo', () => {
    const service = new NotificationSendingService(fixture({ notificationRepo: makeFakeRepo({}), channels: [whatsappChannel()] }));
    const type = { category: { supportsWhatsapp: true } };

    expect(service._resolverEstadoEntrega(fixture({ whatsappSent: false, whatsappError: 'timeout' }), fixture(type))).toBe('failed');
    expect(service._resolverEstadoEntrega(fixture({ whatsappSent: true }), fixture(type))).toBe('completed');
  });
});
