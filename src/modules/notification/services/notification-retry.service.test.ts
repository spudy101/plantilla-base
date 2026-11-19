// tests/unit/modules/schemas/notification/services/notification-retry.service.test.ts
//
// NotificationRetryService — worker de reintentos por canal (push/email/sms). Probamos la lógica
// de decisión, no el acceso a datos: (1) un canal con hard bounce se cierra y no se reenvía;
// (2) los fallos temporales se reenvían por su servicio de envío; (3) SMS no tiene clasificación de
// hard bounce, así que siempre reintenta; (4) email omite notificaciones cuyo tipo ya no existe;
// (5) los conteos {reintentadas, cerradas} reflejan lo ocurrido. Repos, envío, clasificador de
// bounce y logger se mockean para aislar la lógica.

jest.mock('../repositories/notification.repository', () => ({
  findPendingPushRetries: jest.fn(),
  findPendingEmailRetries: jest.fn(),
  findPendingSmsRetries: jest.fn(),
  markEmailPermanentFailure: jest.fn().mockResolvedValue(undefined),
  markPushPermanentFailure: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../repositories/notification-type.repository', () => ({
  findById: jest.fn()
}));

jest.mock('./notification-sending.service', () => ({
  enviarPushIndividual: jest.fn().mockResolvedValue(undefined),
  enviarEmailIndividual: jest.fn().mockResolvedValue(undefined),
  enviarSmsIndividual: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../../shared/constants/aws-error-codes', () => ({
  isHardBounce: jest.fn().mockReturnValue(false)
}));

jest.mock('../../../shared/observability/logger.util', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

import { mocked } from 'tests/helpers/mock';
import notificationRepoModule from '../repositories/notification.repository';
const notificationRepo = mocked(notificationRepoModule);
import notificationTypeRepoModule from '../repositories/notification-type.repository';
const notificationTypeRepo = mocked(notificationTypeRepoModule);
import sendingModule from './notification-sending.service';
const sending = mocked(sendingModule);
import awsErrorCodesModule from '../../../shared/constants/aws-error-codes';
const { isHardBounce } = mocked(awsErrorCodesModule);
import retry from './notification-retry.service';

function notif(overrides = {}) {
  return {
    notificationId: 'n-1',
    notificationTypeId: 't-1',
    userId: 'u-1',
    title: 'Título',
    body: 'Cuerpo',
    metadata: { foo: 'bar' },
    emailErrorCode: null as string | null,
    pushErrorCode: null as string | null,
    ...overrides
  };
}

describe('NotificationRetryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isHardBounce.mockReturnValue(false);
  });

  describe('reintentarEnviosPush', () => {
    it('reenvía los pendientes que no son hard bounce y cuenta las reintentadas', async () => {
      notificationRepo.findPendingPushRetries.mockResolvedValue([notif({ notificationId: 'n-1' }), notif({ notificationId: 'n-2' })]);

      const result = await retry.reintentarEnviosPush();

      expect(sending.enviarPushIndividual).toHaveBeenCalledTimes(2);
      expect(notificationRepo.markPushPermanentFailure).not.toHaveBeenCalled();
      expect(result).toEqual({ reintentadas: 2, cerradas: 0 });
    });

    it('cierra el canal por hard bounce (no reenvía) y lo cuenta como cerrada', async () => {
      notificationRepo.findPendingPushRetries.mockResolvedValue([notif({ notificationId: 'n-1', pushErrorCode: 'EndpointDisabled' })]);
      isHardBounce.mockReturnValue(true);

      const result = await retry.reintentarEnviosPush();

      // El código lo guardó el envío en la propia notificación.
      expect(isHardBounce).toHaveBeenCalledWith('push', 'EndpointDisabled');
      expect(notificationRepo.markPushPermanentFailure).toHaveBeenCalledWith('n-1', 'hard_bounce:EndpointDisabled');
      expect(sending.enviarPushIndividual).not.toHaveBeenCalled();
      expect(result).toEqual({ reintentadas: 0, cerradas: 1 });
    });

    it('sin código guardado no clasifica como hard bounce y reintenta', async () => {
      notificationRepo.findPendingPushRetries.mockResolvedValue([notif()]);
      isHardBounce.mockReturnValue(true);

      const result = await retry.reintentarEnviosPush();

      expect(isHardBounce).not.toHaveBeenCalled();
      expect(sending.enviarPushIndividual).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ reintentadas: 1, cerradas: 0 });
    });

    it('propaga el error si falla la consulta de pendientes', async () => {
      notificationRepo.findPendingPushRetries.mockRejectedValue(new Error('db down'));
      await expect(retry.reintentarEnviosPush()).rejects.toThrow('db down');
    });
  });

  describe('reintentarEnviosEmail', () => {
    it('reenvía cuando el tipo de notificación existe', async () => {
      notificationRepo.findPendingEmailRetries.mockResolvedValue([notif()]);
      notificationTypeRepo.findById.mockResolvedValue({ notificationTypeId: 't-1' });

      const result = await retry.reintentarEnviosEmail();

      expect(sending.enviarEmailIndividual).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ reintentadas: 1, cerradas: 0 });
    });

    it('omite (no reintenta ni cuenta) si el tipo de notificación ya no existe', async () => {
      notificationRepo.findPendingEmailRetries.mockResolvedValue([notif()]);
      notificationTypeRepo.findById.mockResolvedValue(null);

      const result = await retry.reintentarEnviosEmail();

      expect(sending.enviarEmailIndividual).not.toHaveBeenCalled();
      expect(result).toEqual({ reintentadas: 0, cerradas: 0 });
    });

    it('cierra el canal email por hard bounce', async () => {
      notificationRepo.findPendingEmailRetries.mockResolvedValue([notif({ notificationId: 'n-9', emailErrorCode: 'Bounce' })]);
      isHardBounce.mockReturnValue(true);

      const result = await retry.reintentarEnviosEmail();

      expect(isHardBounce).toHaveBeenCalledWith('email', 'Bounce');
      expect(notificationRepo.markEmailPermanentFailure).toHaveBeenCalledWith('n-9', 'hard_bounce:Bounce');
      expect(sending.enviarEmailIndividual).not.toHaveBeenCalled();
      expect(result).toEqual({ reintentadas: 0, cerradas: 1 });
    });
  });

  describe('reintentarEnviosSms', () => {
    it('SMS no tiene clasificación de hard bounce: siempre reintenta (nunca cierra)', async () => {
      notificationRepo.findPendingSmsRetries.mockResolvedValue([notif()]);
      // Aunque el clasificador dijera que sí, SMS no guarda código → nunca se clasifica.
      isHardBounce.mockReturnValue(true);

      const result = await retry.reintentarEnviosSms();

      expect(isHardBounce).not.toHaveBeenCalled();
      expect(sending.enviarSmsIndividual).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ reintentadas: 1, cerradas: 0 });
    });
  });
});
