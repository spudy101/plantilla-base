// tests/unit/modules/schemas/notification/services/sms.service.test.js
//
// SmsService — canal de SMS (OTP/transaccional) vía AWS SNS. Probamos las cuatro ramas de envío sin
// tocar AWS: (1) modo mock → marca enviado y no toca el circuit breaker; (2) circuito abierto →
// marca fallido y responde circuitOpen; (3) camino feliz → recordSuccess + markSent; (4) fallo tras
// reintentos → recordFailure + markFailed. Además enviarSms delega en enviarSmsOtp y resolveE164
// arma E.164. `withRetry` se mockea para no invocar el cliente SNS real.

jest.mock('@aws-sdk/client-sns', () => ({ SNSClient: class {}, PublishCommand: class {} }));

jest.mock('modules/schemas/notification/repositories/sms-delivery-attempt.repository', () => ({
  createAttempt: jest.fn(),
  markSent: jest.fn().mockResolvedValue(undefined),
  markFailed: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/kyc/maintainers/repositories/phone-prefix.repository', () => ({
  findById: jest.fn()
}));

jest.mock('shared/utils/circuit-breaker.util', () => ({
  canCall: jest.fn().mockResolvedValue(true),
  recordSuccess: jest.fn().mockResolvedValue(undefined),
  recordFailure: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('shared/utils/integration-api-logger.util', () => ({ log: jest.fn() }));
jest.mock('shared/utils/retry.util', () => ({ withRetry: jest.fn() }));
jest.mock('shared/utils/aws-provider-meta.util', () => ({ awsErrorCode: jest.fn().mockReturnValue('SNS_ERR') }));
jest.mock('shared/utils/encryption.util', () => ({ generateHash: jest.fn().mockReturnValue('phone-hash') }));

jest.mock('shared/utils/logger.util', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

// MOCKS.EXTERNAL_PROVIDERS es mutable: se alterna por test.
jest.mock('shared/constants', () => ({
  MOCKS: { EXTERNAL_PROVIDERS: false },
  aws: { region: 'us-east-1', accessKeyId: 'ak', secretAccessKey: 'sk' }
}));

const attemptRepo = require('modules/schemas/notification/repositories/sms-delivery-attempt.repository');
const phonePrefixRepo = require('modules/schemas/kyc/maintainers/repositories/phone-prefix.repository');
const CircuitBreaker = require('shared/utils/circuit-breaker.util');
const ProviderApiLogger = require('shared/utils/integration-api-logger.util');
const { withRetry } = require('shared/utils/retry.util');
const constants = require('shared/constants');
const sms = require('modules/schemas/notification/services/sms.service');

const ATTEMPT_ID = 'att-1';
const okParams = { phoneNumber: '+56911112222', message: 'Tu código es 123456', userId: 'u-1', purpose: 'mfa_login' };

describe('SmsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    constants.MOCKS.EXTERNAL_PROVIDERS = false;
    CircuitBreaker.canCall.mockResolvedValue(true);
    attemptRepo.createAttempt.mockResolvedValue({ sms_attempt_id: ATTEMPT_ID, purpose: 'mfa_login' });
  });

  describe('enviarSmsOtp — modo mock', () => {
    it('marca enviado con id MOCK-*, no toca el circuit breaker y responde mock:true', async () => {
      constants.MOCKS.EXTERNAL_PROVIDERS = true;

      const result = await sms.enviarSmsOtp(okParams);

      expect(CircuitBreaker.canCall).not.toHaveBeenCalled();
      expect(withRetry).not.toHaveBeenCalled();
      expect(attemptRepo.markSent).toHaveBeenCalledWith(ATTEMPT_ID, { providerMessageId: `MOCK-${ATTEMPT_ID}` });
      expect(result).toEqual({ success: true, attemptId: ATTEMPT_ID, mock: true });
    });
  });

  describe('enviarSmsOtp — circuito abierto', () => {
    it('marca fallido, registra circuit_open y responde circuitOpen sin enviar', async () => {
      CircuitBreaker.canCall.mockResolvedValue(false);

      const result = await sms.enviarSmsOtp(okParams);

      expect(withRetry).not.toHaveBeenCalled();
      expect(attemptRepo.markFailed).toHaveBeenCalledWith(ATTEMPT_ID, expect.objectContaining({ lastError: expect.stringMatching(/Circuit breaker/i) }));
      expect(ProviderApiLogger.log).toHaveBeenCalledWith(expect.objectContaining({ result: 'circuit_open' }));
      expect(result).toMatchObject({ success: false, attemptId: ATTEMPT_ID, circuitOpen: true });
    });
  });

  describe('enviarSmsOtp — camino feliz', () => {
    it('registra éxito en circuito y tabla de intentos y responde success', async () => {
      withRetry.mockResolvedValue({ messageId: 'msg-99' });

      const result = await sms.enviarSmsOtp(okParams);

      expect(CircuitBreaker.recordSuccess).toHaveBeenCalledWith('aws_sms');
      expect(CircuitBreaker.recordFailure).not.toHaveBeenCalled();
      expect(attemptRepo.markSent).toHaveBeenCalledWith(ATTEMPT_ID, { providerMessageId: 'msg-99' });
      expect(ProviderApiLogger.log).toHaveBeenCalledWith(expect.objectContaining({ result: 'success' }));
      expect(result).toEqual({ success: true, attemptId: ATTEMPT_ID });
    });
  });

  describe('enviarSmsOtp — fallo tras reintentos', () => {
    it('registra el fallo en circuito y tabla y responde serviceUnavailable', async () => {
      withRetry.mockRejectedValue(new Error('SNS timeout'));

      const result = await sms.enviarSmsOtp(okParams);

      expect(CircuitBreaker.recordFailure).toHaveBeenCalledWith('aws_sms');
      expect(CircuitBreaker.recordSuccess).not.toHaveBeenCalled();
      expect(attemptRepo.markFailed).toHaveBeenCalledWith(ATTEMPT_ID, expect.objectContaining({ lastError: 'SNS timeout' }));
      expect(ProviderApiLogger.log).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed', errorCode: 'SNS_ERR' }));
      expect(result).toMatchObject({ success: false, attemptId: ATTEMPT_ID, error: 'SNS timeout', serviceUnavailable: true });
    });
  });

  describe('enviarSms', () => {
    it('delega en enviarSmsOtp (misma infraestructura)', async () => {
      constants.MOCKS.EXTERNAL_PROVIDERS = true;
      const spy = jest.spyOn(sms, 'enviarSmsOtp');

      await sms.enviarSms({ phoneNumber: '+56911112222', message: 'hola', userId: 'u-2', purpose: 'alerta' });

      expect(spy).toHaveBeenCalledWith({ phoneNumber: '+56911112222', message: 'hola', userId: 'u-2', purpose: 'alerta' });
      spy.mockRestore();
    });
  });

  describe('resolveE164', () => {
    it('devuelve el número tal cual si ya viene en E.164', async () => {
      await expect(sms.resolveE164('+56911112222', 'pref-1')).resolves.toBe('+56911112222');
      expect(phonePrefixRepo.findById).not.toHaveBeenCalled();
    });

    it('devuelve el número local si no hay prefijo', async () => {
      await expect(sms.resolveE164('911112222', null)).resolves.toBe('911112222');
      expect(phonePrefixRepo.findById).not.toHaveBeenCalled();
    });

    it('antepone el prefijo resuelto', async () => {
      phonePrefixRepo.findById.mockResolvedValue({ prefix: '+56' });
      await expect(sms.resolveE164('911112222', 'pref-1')).resolves.toBe('+56911112222');
    });

    it('devuelve el local si el prefijo no resuelve', async () => {
      phonePrefixRepo.findById.mockResolvedValue(null);
      await expect(sms.resolveE164('911112222', 'pref-x')).resolves.toBe('911112222');
    });
  });
});
