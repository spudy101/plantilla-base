// callProvider: la única forma de llamar a un proveedor externo (SES, S3, SNS…).
//
// Junta en un lugar lo que cada llamada necesita, en este orden:
//   circuit breaker (por producto) → reintentos con backoff → timeout por intento → una línea de log
// La línea de log es la traza de la llamada y, en producción, sus métricas en CloudWatch (EMF).
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
import loggerUtilModule from '../observability/logger.util';
const { logger } = loggerUtilModule;
import errorMessageModule from '../utils/error-message.util';
import constantsModule from '../constants';

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

/** Productos con circuito propio. Uno nuevo (p. ej. mercadopago) se agrega acá. */
const PROVIDER_PRODUCTS = Object.freeze(['ses', 's3', 'sns', 'aws_sms'] as const);
type ProviderProduct = (typeof PROVIDER_PRODUCTS)[number];

type CallResult = 'success' | 'failed' | 'circuit_open';

// Métricas en CloudWatch con Embedded Metric Format: la misma línea de log que sirve de traza (Logs
// Insights por correlationId) trae el bloque `_aws` y CloudWatch la convierte en métricas, sin SDK
// ni llamadas extra. Solo en producción (es donde la consola va en JSON hacia CloudWatch).
// Alarmas sugeridas: Failures/Calls por Product, Rejected > 0 (circuito abierto), Latency p99.
const METRICS_NAMESPACE = 'ProviderCalls';
const emitMetrics = constantsModule.server.nodeEnv === 'production';

function metricsBlock(product: ProviderProduct, result: CallResult, durationMs: number | null) {
  const values: Record<string, number> = {
    Calls: 1,
    Failures: result === 'failed' ? 1 : 0,
    Rejected: result === 'circuit_open' ? 1 : 0,
    ...(durationMs === null ? {} : { Latency: durationMs })
  };
  return {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: METRICS_NAMESPACE,
          Dimensions: [['Product']],
          Metrics: Object.keys(values).map(Name => ({ Name, Unit: Name === 'Latency' ? 'Milliseconds' : 'Count' }))
        }
      ]
    },
    Product: product,
    ...values
  };
}

/** Una línea por llamada: traza en CloudWatch Logs y, en producción, métricas (EMF). */
function logCall(entry: {
  product: ProviderProduct;
  endpoint: string;
  result: CallResult;
  durationMs: number | null;
  notificationId: string | null;
  error?: unknown;
}) {
  const { product, endpoint, result, durationMs, notificationId, error } = entry;
  const fields = {
    product,
    endpoint,
    result,
    durationMs,
    ...(notificationId ? { notificationId } : {}),
    ...(error === undefined ? {} : { errorCode: awsErrorCode(error), error: errorMessage(error) }),
    ...(emitMetrics ? metricsBlock(product, result, durationMs) : {})
  };
  const message = `[Provider] ${product} ${endpoint} → ${result}`;
  if (result === 'success') {
    logger.info(message, fields);
  } else {
    logger.warn(message, fields);
  }
}

interface ProviderCall {
  product: ProviderProduct;
  endpoint: string;
  /** Si la llamada es un envío de una notificación: queda en la traza para buscarla. */
  notificationId?: string | null;
}

async function callProvider<T>(call: ProviderCall, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const { product, endpoint, notificationId = null } = call;
  const { timeoutMs, maxRetries } = await ResilienceConfig.get();
  const startTime = Date.now();

  try {
    const result = await CircuitBreaker.execute(
      product,
      () => withRetry(() => fn(AbortSignal.timeout(timeoutMs)), { maxRetries, label: endpoint, shouldRetry: isTransientError }),
      { isFailure: isTransientError }
    );
    logCall({ product, endpoint, result: 'success', durationMs: Date.now() - startTime, notificationId });
    return result;
  } catch (error) {
    const circuitOpen = error instanceof CircuitOpenError;
    logCall({
      product,
      endpoint,
      result: circuitOpen ? 'circuit_open' : 'failed',
      durationMs: circuitOpen ? null : Date.now() - startTime,
      notificationId,
      error
    });
    throw error;
  }
}

export { callProvider, isTransientError, CircuitOpenError, AWS_CLIENT_OPTIONS, PROVIDER_PRODUCTS };
export type { ProviderProduct };
export default { callProvider, isTransientError, CircuitOpenError, AWS_CLIENT_OPTIONS, PROVIDER_PRODUCTS };
