// tests/unit/modules/schemas/notification/services/push-notification.service.test.js
//
// PushNotificationService — canal de push (iOS/Android) vía AWS SNS Platform Endpoints. Probamos las
// ramas de valor sin tocar AWS: (1) registrarDispositivo → validación de plataforma (400 antes del
// try/catch), camino feliz y fallo tras reintentos (500); (2) eliminarDispositivo → OK y fallo (500);
// (3) enviarPushIndividual → éxito (log 'success' + devuelve respuesta) vs fallo tras reintentos
// (log 'failed' con errorCode normalizado y devuelve null, NO lanza); (4) enviarPushMasivo →
// agregación de estadísticas. `withRetry` se mockea para no invocar el cliente SNS real.

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: class {},
  CreatePlatformEndpointCommand: class {},
  DeleteEndpointCommand: class {},
  PublishCommand: class {}
}));

jest.mock('shared/utils/retry.util', () => ({ withRetry: jest.fn() }));
jest.mock('shared/utils/integration-api-logger.util', () => ({ log: jest.fn() }));
jest.mock('shared/utils/aws-provider-meta.util', () => ({
  resolveAwsGate: jest.fn().mockResolvedValue({ integrationId: 'int-1', unitCost: 0 }),
  awsErrorCode: jest.fn().mockReturnValue('SNS_ERR')
}));

jest.mock('shared/utils/logger.util', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

jest.mock('shared/constants', () => ({
  aws: { region: 'us-east-1', accessKeyId: 'ak', secretAccessKey: 'sk' },
  notifications: { sns: { platformArnIos: 'arn:aws:sns:ios', platformArnAndroid: 'arn:aws:sns:android' } }
}));

const { withRetry } = require('shared/utils/retry.util');
const ProviderApiLogger = require('shared/utils/integration-api-logger.util');
const { resolveAwsGate, awsErrorCode } = require('shared/utils/aws-provider-meta.util');
const { logger } = require('shared/utils/logger.util');
const push = require('modules/schemas/notification/services/push-notification.service');

const ENDPOINT_ARN = 'arn:aws:sns:endpoint:1';

describe('PushNotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveAwsGate.mockResolvedValue({ integrationId: 'int-1', unitCost: 0 });
    awsErrorCode.mockReturnValue('SNS_ERR');
  });

  describe('registrarDispositivo', () => {
    it('lanza badRequest (400) si la plataforma no está soportada, antes de tocar SNS', async () => {
      await expect(push.registrarDispositivo('tok', 'windows', 'u-1')).rejects.toMatchObject({
        statusCode: 400,
        code: 'BAD_REQUEST'
      });
      expect(withRetry).not.toHaveBeenCalled();
    });

    it('camino feliz: registra el endpoint y devuelve el EndpointArn', async () => {
      withRetry.mockResolvedValue({ EndpointArn: ENDPOINT_ARN });

      const result = await push.registrarDispositivo('tok', 'iOS', 'u-1');

      expect(withRetry).toHaveBeenCalledTimes(1);
      expect(result).toBe(ENDPOINT_ARN);
      expect(logger.info).toHaveBeenCalledWith(
        'Dispositivo registrado exitosamente',
        expect.objectContaining({ userId: 'u-1', endpointArn: ENDPOINT_ARN })
      );
    });

    it('fallo tras reintentos: lanza internal (500) y registra warning', async () => {
      withRetry.mockRejectedValue(new Error('SNS down'));

      await expect(push.registrarDispositivo('tok', 'android', 'u-1')).rejects.toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_ERROR'
      });
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('eliminarDispositivo', () => {
    it('camino feliz: elimina el endpoint y devuelve true', async () => {
      withRetry.mockResolvedValue({});

      await expect(push.eliminarDispositivo(ENDPOINT_ARN)).resolves.toBe(true);
      expect(withRetry).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('Dispositivo eliminado exitosamente', { endpointArn: ENDPOINT_ARN });
    });

    it('fallo tras reintentos: lanza internal (500)', async () => {
      withRetry.mockRejectedValue(new Error('boom'));

      await expect(push.eliminarDispositivo(ENDPOINT_ARN)).rejects.toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_ERROR'
      });
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('enviarPushIndividual', () => {
    it('camino feliz: publica, loguea integración con result=success y devuelve la respuesta', async () => {
      const response = { MessageId: 'm-1' };
      withRetry.mockResolvedValue(response);

      const result = await push.enviarPushIndividual(ENDPOINT_ARN, 'Titulo', 'Cuerpo', { k: 'v' }, 'notif-1');

      expect(resolveAwsGate).toHaveBeenCalledWith('aws_sns');
      expect(result).toBe(response);
      expect(ProviderApiLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ product: 'sns', endpoint: 'SNS:PublishCommand', result: 'success', notificationId: 'notif-1' })
      );
      expect(logger.info).toHaveBeenCalledWith('Push individual enviado exitosamente', expect.any(Object));
    });

    it('fallo tras reintentos: loguea result=failed con errorCode normalizado y devuelve null (no lanza)', async () => {
      withRetry.mockRejectedValue(new Error('SNS timeout'));

      const result = await push.enviarPushIndividual(ENDPOINT_ARN, 'Titulo', 'Cuerpo', {}, 'notif-2');

      expect(result).toBeNull();
      expect(awsErrorCode).toHaveBeenCalled();
      expect(ProviderApiLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'failed',
          errorCode: 'SNS_ERR',
          errorMessage: 'SNS timeout',
          notificationId: 'notif-2'
        })
      );
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('enviarPushMasivo', () => {
    it('camino feliz: agrega estadísticas success=total, failed=0', async () => {
      withRetry.mockResolvedValue({ MessageId: 'm-x' });

      const stats = await push.enviarPushMasivo(['arn-a', 'arn-b', 'arn-c'], 'T', 'B');

      expect(stats).toEqual({ success: 3, failed: 0 });
      expect(logger.info).toHaveBeenCalledWith('Push masivo completado', expect.objectContaining({ total: 3 }));
    });

    it('cuando los envíos individuales fallan, siguen contando como success (ver BUG reportado)', async () => {
      // enviarPushIndividual devuelve null en vez de lanzar/rechazar cuando el push falla, así que el
      // `.then(() => ({ success: true }))` de enviarPushMasivo nunca observa el fallo. Este test fija el
      // comportamiento ACTUAL (buggy) para que un futuro fix salte a la vista.
      withRetry.mockRejectedValue(new Error('todos fallan'));

      const stats = await push.enviarPushMasivo(['arn-a', 'arn-b'], 'T', 'B');

      expect(stats).toEqual({ success: 2, failed: 0 });
    });
  });
});
