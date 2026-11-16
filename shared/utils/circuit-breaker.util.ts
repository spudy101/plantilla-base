/**
 * IntegrationCircuitBreaker — RF-INT-03 / RF-INT-01 Criterio 6 / RF-USR-07
 *
 * Implementa el patrón Circuit Breaker para las llamadas a integraciones externas
 * (AWS y futuros proveedores externos). Keyeado por "producto"/code de integración.
 * El estado se persiste en Redis para funcionar en modo multi-instancia.
 * Si Redis no está disponible, usa un mapa en memoria (por instancia) como degradación.
 *
 * Umbrales (según RF-INT-01):
 *   - Timeout por llamada:     30 000 ms  (pasarlo al axios.timeout)
 *   - Fallos consecutivos:     5
 *   - Tiempo de recuperación:  60 s (espera en OPEN antes de intentar HALF_OPEN)
 *
 * Estados:
 *   CLOSED    → operación normal, las llamadas pasan
 *   OPEN      → circuito abierto, las llamadas se bloquean (fallback RF-USR-07)
 *   HALF_OPEN → prueba de recuperación: deja pasar 1 llamada
 *
 * RF-USR-07: se expone registerCallbacks({ onOpen, onClose }) para que
 *   el ScreeningWorkerHelper registre las acciones de fallback sin acoplamiento circular.
 */

import loggerUtilModule = require('./logger.util');
const { logger } = loggerUtilModule;
import redisClient = require('./redis.util');
import ResilienceConfig = require('./resilience-config.util');
import errorMessageModule = require('./error-message.util');

const { errorMessage } = errorMessageModule;


const STATE_OPEN = 'OPEN';
const STATE_HALF_OPEN = 'HALF_OPEN';

type BreakerStatus = 'CLOSED' | typeof STATE_OPEN | typeof STATE_HALF_OPEN;
interface BreakerState {
  status: BreakerStatus;
  openedAt: number | null;
}
/** Callback de apertura/cierre (RF-USR-07: notificar el fallback). */
type BreakerCallback = (product: string, openedAt: number | null) => unknown;

// Los umbrales (failureThreshold / recoveryTimeMs / failuresTtlS) ya NO se hardcodean: se leen de
// SystemGlobalConfig.integration_resilience.circuit_breaker vía ResilienceConfig (caché 60s, fallback
// duro a 5 / 60000ms / 300s). RF-INT-01 CA-6.

// Defaults duros del breaker (fallback si aún no se resolvió la global). Atajo para no repetir la ruta larga.
const CB_DEFAULTS = ResilienceConfig.HARD_DEFAULTS.circuitBreaker;

// Fallback en memoria si Redis no está disponible
const _inMemory = new Map<string, BreakerState | number>();

function _memKey(product: string) {
  return `tu:cb:${product}`;
}

class IntegrationCircuitBreaker {
  private _onOpenCallback: BreakerCallback | null = null;
  private _onCloseCallback: BreakerCallback | null = null;

  /**
   * Registra callbacks externos para RF-USR-07.
   * Se llama desde el ScreeningWorkerHelper al iniciarse el worker.
   * No lanza si los callbacks están vacíos — es opcional.
   *
   * @param {Object}   opts
   * @param {Function} opts.onOpen  - (product: string, openedAt: number) => void
   * @param {Function} opts.onClose - (product: string, openedAt: number) => void
   */
  registerCallbacks({ onOpen = null, onClose = null }: { onOpen?: BreakerCallback | null; onClose?: BreakerCallback | null } = {}): void {
    this._onOpenCallback = onOpen;
    this._onCloseCallback = onClose;
  }

  /**
   * Consulta si se puede realizar una llamada a la integración externa.
   * Retorna true si el circuito está CLOSED o HALF_OPEN (prueba).
   * Retorna false si el circuito está OPEN.
   *
   * @param {string} product - identificador de la integración externa (ej: 'identity', 'document', 'biometric')
   * @returns {Promise<boolean>}
   */
  async canCall(product: string) {
    const state = await this._getState(product);

    if (!state || state.status === 'CLOSED') {
      return true;
    }

    const { recoveryTimeMs } = (await ResilienceConfig.get()).circuitBreaker;

    if (state.status === STATE_OPEN) {
      const elapsed = Date.now() - (state.openedAt || 0);
      if (elapsed >= recoveryTimeMs) {
        // Transición a HALF_OPEN — dejamos pasar 1 llamada de prueba
        await this._setState(product, STATE_HALF_OPEN, state.openedAt, recoveryTimeMs);
        logger.info(`[CircuitBreaker] ${product} → HALF_OPEN (probando recuperación)`, { elapsed });
        return true;
      }

      // Circuito todavía abierto → bloquear
      logger.warn(`[CircuitBreaker] ${product} → OPEN — llamada bloqueada`, {
        openedAt: new Date(state.openedAt ?? 0).toISOString(),
        remainingMs: recoveryTimeMs - elapsed
      });

      // TODO [RF-USR-07 — Julio 2026]: this._onCircuitOpen(product);
      return false;
    }

    // HALF_OPEN → dejar pasar la prueba
    return true;
  }

  /**
   * Registra un resultado exitoso. Resetea el contador de fallos.
   * Si el circuito estaba HALF_OPEN lo cierra definitivamente.
   *
   * @param {string} product
   */
  async recordSuccess(product: string) {
    const state = await this._getState(product);

    if (state?.status === STATE_HALF_OPEN) {
      logger.info(`[CircuitBreaker] ${product} → CLOSED (recuperado exitosamente)`);

      // RF-USR-07: notificar cierre del fallback
      const onClose = this._onCloseCallback;
      if (onClose) {
        const { openedAt } = state;
        setImmediate(() => onClose(product, openedAt));
      }
    }

    await this._resetFailures(product);
  }

  /**
   * Registra un fallo. Si se alcanzan 5 consecutivos abre el circuito.
   *
   * @param {string} product
   */
  async recordFailure(product: string) {
    const { failureThreshold, recoveryTimeMs, failuresTtlS } = (await ResilienceConfig.get()).circuitBreaker;
    const failures = await this._incrementFailures(product, failuresTtlS);

    logger.warn(`[CircuitBreaker] ${product} — fallo consecutivo ${failures}/${failureThreshold}`);

    if (failures >= failureThreshold) {
      const currentState = await this._getState(product);

      if (!currentState || currentState.status !== STATE_OPEN) {
        const openedAt = Date.now();
        await this._setState(product, STATE_OPEN, openedAt, recoveryTimeMs);
        logger.warn(`[CircuitBreaker] ${product} → OPEN — umbral de ${failureThreshold} fallos alcanzado`);

        // RF-USR-07: notificar apertura del fallback
        const onOpen = this._onOpenCallback;
        if (onOpen) {
          setImmediate(() => onOpen(product, openedAt));
        }
      }
    }
  }

  /**
   * Retorna el estado actual del circuito para un producto.
   * Útil para endpoints de monitoreo / health.
   *
   * @param {string} product
   * @returns {Promise<{status: string, failures: number, openedAt: number|null}>}
   */
  async getStatus(product: string) {
    const [state, failures] = await Promise.all([this._getState(product), this._getFailures(product)]);

    return {
      product,
      status: state?.status || 'CLOSED',
      failures,
      openedAt: state?.openedAt || null,
      openedAtISO: state?.openedAt ? new Date(state.openedAt).toISOString() : null
    };
  }

  // ══════════════════════════════════════════════════════════════
  // Implementación interna — Redis con fallback en memoria
  // ══════════════════════════════════════════════════════════════

  async _getState(product: string): Promise<BreakerState | null> {
    const key = `${_memKey(product)}:state`;

    const redis = redisClient.getClient?.() ?? null;
    if (redis) {
      try {
        const raw = await redis.get(key);
        return raw ? (JSON.parse(raw) as BreakerState) : null;
      } catch (error) {
        logger.warn('[CircuitBreaker] Redis getState failed, usando memoria', { product, error: errorMessage(error) });
      }
    }

    const value = _inMemory.get(key);
    return typeof value === 'object' ? value : null;
  }

  async _setState(
    product: string,
    status: BreakerStatus,
    openedAt: number | null = null,
    recoveryTimeMs: number = CB_DEFAULTS.recoveryTimeMs
  ): Promise<void> {
    const value: BreakerState = { status, openedAt };
    const key = `${_memKey(product)}:state`;
    const serialized = JSON.stringify(value);
    const MS_PER_S = 1000;
    const TTL_FACTOR = 2;

    const redis = redisClient.getClient?.() ?? null;
    if (redis) {
      try {
        await redis.set(key, serialized, 'EX', Math.ceil(recoveryTimeMs / MS_PER_S) * TTL_FACTOR);
        return;
      } catch (error) {
        logger.warn('[CircuitBreaker] Redis setState failed, usando memoria', { product, error: errorMessage(error) });
      }
    }

    _inMemory.set(key, value);
  }

  async _resetFailures(product: string) {
    const key = `${_memKey(product)}:failures`;
    const stateKey = `${_memKey(product)}:state`;

    const redis = redisClient.getClient?.() ?? null;
    if (redis) {
      try {
        await redis.del(key, stateKey);
        return;
      } catch (error) {
        logger.warn('[CircuitBreaker] Redis resetFailures failed, usando memoria', { product, error: errorMessage(error) });
      }
    }

    _inMemory.delete(key);
    _inMemory.delete(stateKey);
  }

  async _incrementFailures(product: string, failuresTtlS: number = CB_DEFAULTS.failuresTtlS): Promise<number> {
    const key = `${_memKey(product)}:failures`;

    const redis = redisClient.getClient?.() ?? null;
    if (redis) {
      try {
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, failuresTtlS);
        }
        return count;
      } catch (error) {
        logger.warn('[CircuitBreaker] Redis incrementFailures failed, usando memoria', { product, error: errorMessage(error) });
      }
    }

    const stored = _inMemory.get(key);
    const current = (typeof stored === 'number' ? stored : 0) + 1;
    _inMemory.set(key, current);
    return current;
  }

  async _getFailures(product: string) {
    const key = `${_memKey(product)}:failures`;

    const redis = redisClient.getClient?.() ?? null;
    if (redis) {
      try {
        const raw = await redis.get(key);
        return raw ? Number.parseInt(raw, 10) : 0;
      } catch (error) {
        logger.warn('[CircuitBreaker] Redis getFailures failed, usando memoria', { product, error: errorMessage(error) });
      }
    }

    return _inMemory.get(key) || 0;
  }
}

export = new IntegrationCircuitBreaker();
