// tests/unit/modules/schemas/notification/services/push-notification.service.test.ts
//
// PushNotificationService — canal de push (iOS/Android) vía AWS SNS Platform Endpoints. Probamos las
// ramas de valor sin tocar AWS: (1) registrarDispositivo → validación de plataforma (400 antes del
// try/catch), camino feliz, fallo (500) y circuito abierto (503); (2) eliminarDispositivo → OK y fallo
// (500); (3) enviarPushIndividual → éxito vs fallo (devuelve null, NO lanza); (4) enviarPushMasivo →
// agregación de estadísticas. `callProvider` (breaker, reintentos, timeout y log) se mockea.

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: class {},
  CreatePlatformEndpointCommand: class {},
  DeleteEndpointCommand: class {},
  PublishCommand: class {}
}));

jest.mock('../../../shared/infra/provider-call.util', () => ({
  callProvider: jest.fn(),
  CircuitOpenError: class CircuitOpenError extends Error {
    statusCode = 503;
  }
}));

jest.mock('../../../shared/observability/logger.util', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

jest.mock('../../../shared/constants', () => ({
  aws: { region: 'us-east-1', accessKeyId: 'ak', secretAccessKey: 'sk' },
  notifications: { sns: { platformArnIos: 'arn:aws:sns:ios', platformArnAndroid: 'arn:aws:sns:android' } }
}));

import { mocked } from 'tests/helpers/mock';
import * as providerCallModule from '../../../shared/infra/provider-call.util';
const callProvider = mocked(providerCallModule.callProvider);
const { CircuitOpenError } = providerCallModule;
import loggerUtilModule from '../../../shared/observability/logger.util';
const { logger } = mocked(loggerUtilModule);
import push from './push-notification.service';

const ENDPOINT_ARN = 'arn:aws:sns:endpoint:1';

describe('PushNotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('registrarDispositivo', () => {
    it('lanza badRequest (400) si la plataforma no está soportada, antes de tocar SNS', async () => {
      await expect(push.registrarDispositivo('tok', 'windows', 'u-1')).rejects.toMatchObject({
        statusCode: 400,
        code: 'BAD_REQUEST'
      });
      expect(callProvider).not.toHaveBeenCalled();
    });

    it('camino feliz: registra el endpoint y devuelve el EndpointArn', async () => {
      callProvider.mockResolvedValue({ EndpointArn: ENDPOINT_ARN });

      const result = await push.registrarDispositivo('tok', 'iOS', 'u-1');

      expect(callProvider).toHaveBeenCalledTimes(1);
      expect(result).toBe(ENDPOINT_ARN);
      expect(logger.info).toHaveBeenCalledWith(
        'Dispositivo registrado exitosamente',
        expect.objectContaining({ userId: 'u-1', endpointArn: ENDPOINT_ARN })
      );
    });

    it('fallo del proveedor: lanza internal (500) y registra warning', async () => {
      callProvider.mockRejectedValue(new Error('SNS down'));

      await expect(push.registrarDispositivo('tok', 'android', 'u-1')).rejects.toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_ERROR'
      });
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('registrarDispositivo — circuito abierto', () => {
    it('propaga el 503 del circuito en vez de convertirlo en 500', async () => {
      callProvider.mockRejectedValue(new CircuitOpenError('sns'));
      await expect(push.registrarDispositivo('tok', 'ios', 'u-1')).rejects.toMatchObject({ statusCode: 503 });
    });
  });

  describe('eliminarDispositivo', () => {
    it('camino feliz: elimina el endpoint y devuelve true', async () => {
      callProvider.mockResolvedValue({});

      await expect(push.eliminarDispositivo(ENDPOINT_ARN)).resolves.toBe(true);
      expect(callProvider).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('Dispositivo eliminado exitosamente', { endpointArn: ENDPOINT_ARN });
    });

    it('fallo del proveedor: lanza internal (500)', async () => {
      callProvider.mockRejectedValue(new Error('boom'));

      await expect(push.eliminarDispositivo(ENDPOINT_ARN)).rejects.toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_ERROR'
      });
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('enviarPushIndividual', () => {
    it('camino feliz: publica por callProvider (sns) y devuelve la respuesta', async () => {
      const response = { MessageId: 'm-1' };
      callProvider.mockResolvedValue(response);

      const result = await push.enviarPushIndividual(ENDPOINT_ARN, 'Titulo', 'Cuerpo', { k: 'v' }, 'notif-1');

      expect(callProvider).toHaveBeenCalledWith({ product: 'sns', endpoint: 'SNS:PublishCommand', notificationId: 'notif-1' }, expect.any(Function));
      expect(result).toBe(response);
      expect(logger.info).toHaveBeenCalledWith('Push individual enviado exitosamente', expect.any(Object));
    });

    it('fallo: devuelve null (no lanza) y registra warning', async () => {
      callProvider.mockRejectedValue(new Error('SNS timeout'));

      const result = await push.enviarPushIndividual(ENDPOINT_ARN, 'Titulo', 'Cuerpo', {}, 'notif-2');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('enviarPushMasivo', () => {
    it('camino feliz: agrega estadísticas success=total, failed=0', async () => {
      callProvider.mockResolvedValue({ MessageId: 'm-x' });

      const stats = await push.enviarPushMasivo(['arn-a', 'arn-b', 'arn-c'], 'T', 'B');

      expect(stats).toEqual({ success: 3, failed: 0 });
      expect(logger.info).toHaveBeenCalledWith('Push masivo completado', expect.objectContaining({ total: 3 }));
    });

    it('cuando los envíos individuales fallan, siguen contando como success (ver BUG reportado)', async () => {
      // enviarPushIndividual devuelve null en vez de lanzar/rechazar cuando el push falla, así que el
      // `.then(() => ({ success: true }))` de enviarPushMasivo nunca observa el fallo. Este test fija el
      // comportamiento ACTUAL (buggy) para que un futuro fix salte a la vista.
      callProvider.mockRejectedValue(new Error('todos fallan'));

      const stats = await push.enviarPushMasivo(['arn-a', 'arn-b'], 'T', 'B');

      expect(stats).toEqual({ success: 2, failed: 0 });
    });
  });
});
