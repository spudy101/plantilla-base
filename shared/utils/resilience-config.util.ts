// Resolver de configuración de RESILIENCIA de integraciones (RF-INT-01 CA-6).
//
// Fuente única: SystemGlobalConfig.integration_resilience (un solo valor homologado para TODAS las
// integraciones salientes — sin overrides por proveedor). Lo consumen el circuit breaker y todos los
// clientes (timeout de axios + reintentos de withRetry + umbrales del breaker).
//
// El circuit breaker corre en CADA llamada saliente → esto se cachea en memoria (TTL 60s, mismo criterio
// que el IntegrationGuard). Si la global no está disponible (arranque temprano, BD caída), se cae a
// FALLBACK DURO con los mismos defaults históricos: el breaker NUNCA queda sin umbrales.

import { interopDefault } from './interop.util';
import loggerUtilModule from './logger.util';
const { logger } = loggerUtilModule;
import errorMessageModule from './error-message.util';

const { errorMessage } = errorMessageModule;

const CACHE_TTL_MS = 60000;

// Fallback duro = los valores hardcodeados/env de siempre (30s / 10s / 3 / 5-60s-300s).
const HARD_DEFAULTS = Object.freeze({
  timeoutMs: 30000,
  manualReviewTimeoutMs: 10000,
  maxRetries: 3,
  circuitBreaker: Object.freeze({ failureThreshold: 5, recoveryTimeMs: 60000, failuresTtlS: 300 }),
  // §7.2/§7.5 — Control de caudal del worker de screening hacia la CENTRAL. NO son límites del
  // proveedor: son una estimación PRUDENTE del dev. Existen para NO golpear a la central con ráfagas.
  // Ajustar SOLO cuando la central entregue su límite real (consultas/segundo, tope diario). La señal
  // por evento despierta al worker pero NO salta este throttle: un screening por evento pasa por el
  // mismo lote + espaciado que uno tomado por el cron.
  screeningThrottle: Object.freeze({ batchSize: 50, spacingMs: 100 })
});

/** Configuración de resiliencia en camelCase (lo que consumen los clientes de integraciones). */
interface ResilienceConfig {
  timeoutMs: number;
  manualReviewTimeoutMs: number;
  maxRetries: number;
  circuitBreaker: { failureThreshold: number; recoveryTimeMs: number; failuresTtlS: number };
  screeningThrottle: { batchSize: number; spacingMs: number };
}

/** Forma persistida (snake_case) en system_global_config.integration_resilience. */
interface StoredResilience {
  timeout_ms?: number;
  manual_review_timeout_ms?: number;
  max_retries?: number;
  circuit_breaker?: { failure_threshold?: number; recovery_time_ms?: number; failures_ttl_s?: number };
  screening_throttle?: { batch_size?: number; spacing_ms?: number };
}

let _cache: ResilienceConfig | null = null;
let _cacheAt = 0;

// camelCase para el consumo interno, a partir del snake_case persistido en la global.
async function _load(): Promise<ResilienceConfig> {
  // require lazy: evita ciclos de carga (models ↔ utils) al arrancar.
  const systemGlobalConfigRepository = interopDefault(require('../../modules/schemas/core/repositories/system-global-config.repository') as typeof import('../../modules/schemas/core/repositories/system-global-config.repository'));
  const config = await systemGlobalConfigRepository.findActiveResilience();
  // integration_resilience es JSONB (unknown en el modelo): lo escribe el admin validado por su DTO
  const r = (config?.integrationResilience ?? {}) as StoredResilience;
  const cb = r.circuit_breaker ?? {};
  const st = r.screening_throttle ?? {};
  return {
    timeoutMs: r.timeout_ms ?? HARD_DEFAULTS.timeoutMs,
    manualReviewTimeoutMs: r.manual_review_timeout_ms ?? HARD_DEFAULTS.manualReviewTimeoutMs,
    maxRetries: r.max_retries ?? HARD_DEFAULTS.maxRetries,
    circuitBreaker: {
      failureThreshold: cb.failure_threshold ?? HARD_DEFAULTS.circuitBreaker.failureThreshold,
      recoveryTimeMs: cb.recovery_time_ms ?? HARD_DEFAULTS.circuitBreaker.recoveryTimeMs,
      failuresTtlS: cb.failures_ttl_s ?? HARD_DEFAULTS.circuitBreaker.failuresTtlS
    },
    screeningThrottle: {
      batchSize: st.batch_size ?? HARD_DEFAULTS.screeningThrottle.batchSize,
      spacingMs: st.spacing_ms ?? HARD_DEFAULTS.screeningThrottle.spacingMs
    }
  };
}

/**
 * Devuelve la config de resiliencia homologada (cacheada 60s). Nunca lanza: ante error usa el
 * último valor cacheado o el fallback duro.
 *
 * @returns {Promise<{timeoutMs:number, manualReviewTimeoutMs:number, maxRetries:number, circuitBreaker:object}>}
 */
async function get(): Promise<ResilienceConfig> {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL_MS) {
    return _cache;
  }
  try {
    _cache = await _load();
    _cacheAt = Date.now();
  } catch (error) {
    logger.warn('[ResilienceConfig] No se pudo leer la global — usando el último valor o el fallback duro', {
      error: errorMessage(error)
    });
    return _cache ?? { ...HARD_DEFAULTS, circuitBreaker: { ...HARD_DEFAULTS.circuitBreaker } };
  }
  return _cache;
}

// Para tests / invalidación explícita si hiciera falta.
function _resetCache(): void {
  _cache = null;
  _cacheAt = 0;
}

export default { get, HARD_DEFAULTS, _resetCache };
