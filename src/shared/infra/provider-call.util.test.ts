// callProvider: breaker + reintentos (solo transitorios) + timeout por intento + log de la llamada.
// El breaker es el real en memoria; logger, config y el writer del log van con dobles.

jest.mock('./redis.util', () => ({ getClient: jest.fn(() => null), isAvailable: jest.fn(() => false) }));
jest.mock('./resilience-config.util', () => ({
  HARD_DEFAULTS: { circuitBreaker: { failureThreshold: 5, recoveryTimeMs: 60000, failuresTtlS: 300 } },
  get: jest.fn()
}));
jest.mock('../observability/logger.util', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../observability/integration-api-logger.util', () => ({ log: jest.fn() }));

import { mocked } from 'tests/helpers/mock';
import ResilienceConfigModule from './resilience-config.util';
const ResilienceConfig = mocked(ResilienceConfigModule);
import ProviderApiLoggerModule from '../observability/integration-api-logger.util';
const ProviderApiLogger = mocked(ProviderApiLoggerModule);
import CircuitBreaker from './circuit-breaker.util';
import { callProvider, isTransientError, CircuitOpenError } from './provider-call.util';

const awsError = (name: string, httpStatusCode: number, extra: object = {}) =>
  Object.assign(new Error(name), { name, $metadata: { httpStatusCode }, ...extra });

describe('isTransientError', () => {
  it.each([
    ['5xx', awsError('InternalFailure', 500), true],
    ['503', awsError('ServiceUnavailable', 503), true],
    ['429', awsError('TooManyRequests', 429), true],
    ['throttling con 400', awsError('ThrottlingException', 400), true],
    ['$retryable', awsError('Algo', 400, { $retryable: {} }), true],
    ['timeout / abort (sin HTTP)', Object.assign(new Error('timeout'), { name: 'TimeoutError' }), true],
    ['red (sin HTTP)', Object.assign(new Error('socket'), { code: 'ECONNRESET' }), true],
    ['400 del cliente', awsError('MessageRejected', 400), false],
    ['403', awsError('AccessDenied', 403), false],
    ['404', awsError('NoSuchKey', 404), false],
    ['$fault client sin status', Object.assign(new Error('x'), { $fault: 'client' }), false]
  ])('%s → %s', (_label, error, expected) => {
    expect(isTransientError(error)).toBe(expected);
  });
});

describe('callProvider', () => {
  const call = { product: 'ses' as const, endpoint: 'SES:SendEmailCommand', notificationId: 'n-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    CircuitBreaker._resetMemory();
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    ResilienceConfig.get.mockResolvedValue({
      timeoutMs: 5000,
      maxRetries: 3,
      circuitBreaker: { failureThreshold: 2, recoveryTimeMs: 60000, failuresTtlS: 300 }
    } as never);
  });

  afterEach(() => jest.useRealTimers());

  it('éxito: devuelve el resultado y lo registra', async () => {
    const result = await callProvider({ ...call, responsePayload: (r: { id: string }) => ({ id: r.id }) }, () =>
      Promise.resolve({ id: 'm-1' })
    );
    expect(result).toEqual({ id: 'm-1' });
    expect(ProviderApiLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        product: 'ses',
        endpoint: 'SES:SendEmailCommand',
        result: 'success',
        notificationId: 'n-1',
        responsePayload: { id: 'm-1' }
      })
    );
  });

  it('pasa a cada intento una señal con el timeout de settings', async () => {
    const signals: AbortSignal[] = [];
    await callProvider(call, signal => {
      signals.push(signal);
      return Promise.resolve('ok');
    });
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0]!.aborted).toBe(false);
  });

  it('error transitorio: reintenta hasta maxRetries y cuenta UN fallo para el circuito', async () => {
    const fn = jest.fn(() => Promise.reject(awsError('ServiceUnavailable', 503)));
    const pending = callProvider(call, fn).catch((e: unknown) => e);
    await jest.runAllTimersAsync();
    expect(await pending).toMatchObject({ name: 'ServiceUnavailable' });
    expect(fn).toHaveBeenCalledTimes(3);
    expect((await CircuitBreaker.getStatus('ses')).failures).toBe(1);
    expect(ProviderApiLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'failed', errorCode: 'ServiceUnavailable' })
    );
  });

  it('error del cliente: no reintenta ni cuenta para el circuito', async () => {
    const fn = jest.fn(() => Promise.reject(awsError('MessageRejected', 400)));
    await expect(callProvider(call, fn)).rejects.toMatchObject({ name: 'MessageRejected' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect((await CircuitBreaker.getStatus('ses')).failures).toBe(0);
  });

  it('circuito abierto: no llama, lanza CircuitOpenError y lo registra como circuit_open', async () => {
    for (let i = 0; i < 2; i++) {
      const pending = callProvider(call, () => Promise.reject(awsError('InternalFailure', 500))).catch(() => null);
      await jest.runAllTimersAsync();
      await pending;
    }
    const fn = jest.fn(() => Promise.resolve('ok'));
    await expect(callProvider(call, fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
    expect(ProviderApiLogger.log).toHaveBeenLastCalledWith(
      expect.objectContaining({ result: 'circuit_open', responseTimeMs: null })
    );
  });
});
