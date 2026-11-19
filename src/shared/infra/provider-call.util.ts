// callProvider: la única forma de llamar a un proveedor externo (SES, S3, SNS…).
//
// Junta en un lugar lo que cada llamada necesita, en este orden:
//   circuit breaker (por producto) → reintentos con backoff → timeout por intento → log en integration_api_logs
//
// Timeout y reintentos salen de settings (ResilienceConfig). Solo se reintentan, y solo abren el
// circuito, los errores transitorios (isTransientError): un error del cliente (dirección inválida,
// acceso denegado) se propaga al primer intento.
//
//   const res = await callProvider({ product: 'ses', endpoint: 'SES:SendEmailCommand' },
//     signal => sesClient.send(command, { abortSignal: signal }));

import CircuitBreaker, { CircuitOpenError } from './circuit-breaker.util';
import ResilienceConfig from './resilience-config.util';
import retryUtilModule from './retry.util';
const { withRetry } = retryUtilModule;
import awsProviderMetaUtilModule from './aws-provider-meta.util';
const { awsErrorCode } = awsProviderMetaUtilModule;
import ProviderApiLogger from '../observability/integration-api-logger.util';
import errorMessageModule from '../utils/error-message.util';
import type DomainEnums from '../constants/domain-enums';

const { errorMessage } = errorMessageModule;

/**
 * Opciones para todo cliente del AWS SDK cuyas llamadas pasan por callProvider: `new SESClient({ ...AWS_CLIENT_OPTIONS, … })`.
 * El SDK v3 reintenta por su cuenta (3 intentos por defecto). Sumado a los reintentos de callProvider, una
 * llamada caída hacía hasta 9 intentos, con timeouts y backoff que no salían de settings. Acá reintenta solo
 * callProvider. Sin timeout en el cliente: lo pone callProvider en cada intento.
 */
const AWS_CLIENT_OPTIONS = Object.freeze({ maxAttempts: 1 });

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_REQUEST_TIMEOUT = 408;
const HTTP_SERVER_ERROR = 500;
const THROTTLING_NAMES = new Set([
  'ThrottlingException',
  'Throttling',
  'TooManyRequestsException',
  'ProvisionedThroughputExceededException',
  'RequestLimitExceeded',
  'SlowDown'
]);

/**
 * ¿El error dice que el proveedor está mal (vale reintentar y cuenta para el circuito)?
 * Sí: throttling, 5xx, 408/429, timeouts y errores de red (sin respuesta HTTP).
 * No: el resto de 4xx — el proveedor respondió y el problema es la petición.
 */
function isTransientError(error: unknown): boolean {
  const e = error as { name?: string; $retryable?: unknown; $fault?: string; $metadata?: { httpStatusCode?: number } } | null;
  if (!e || typeof e !== 'object') {
    return true;
  }
  if (e.$retryable || (e.name && THROTTLING_NAMES.has(e.name))) {
    return true;
  }
  const status = e.$metadata?.httpStatusCode;
  if (status) {
    return status >= HTTP_SERVER_ERROR || status === HTTP_TOO_MANY_REQUESTS || status === HTTP_REQUEST_TIMEOUT;
  }
  if (e.$fault) {
    return e.$fault === 'server';
  }
  return true;
}

interface ProviderCall<T> {
  product: DomainEnums.IntegrationProduct;
  endpoint: string;
  notificationId?: string | null;
  requestPayload?: unknown;
  /** Qué guardar de la respuesta en el log (por defecto nada). */
  responsePayload?: (result: T) => unknown;
}

async function callProvider<T>(call: ProviderCall<T>, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const { product, endpoint, notificationId = null, requestPayload = null } = call;
  const { timeoutMs, maxRetries } = await ResilienceConfig.get();
  const startTime = Date.now();

  try {
    const result = await CircuitBreaker.execute(
      product,
      () => withRetry(() => fn(AbortSignal.timeout(timeoutMs)), { maxRetries, label: endpoint, shouldRetry: isTransientError }),
      { isFailure: isTransientError }
    );
    ProviderApiLogger.log({
      product,
      endpoint,
      result: 'success',
      responseTimeMs: Date.now() - startTime,
      notificationId,
      requestPayload,
      responsePayload: call.responsePayload ? call.responsePayload(result) : null
    });
    return result;
  } catch (error) {
    const circuitOpen = error instanceof CircuitOpenError;
    ProviderApiLogger.log({
      product,
      endpoint,
      result: circuitOpen ? 'circuit_open' : 'failed',
      responseTimeMs: circuitOpen ? null : Date.now() - startTime,
      errorCode: circuitOpen ? null : awsErrorCode(error),
      errorMessage: errorMessage(error),
      notificationId,
      requestPayload
    });
    throw error;
  }
}

export { callProvider, isTransientError, CircuitOpenError, AWS_CLIENT_OPTIONS };
export default { callProvider, isTransientError, CircuitOpenError, AWS_CLIENT_OPTIONS };
