// tests/unit/shared/circuit-breaker.util.test.ts
//
// IntegrationCircuitBreaker (singleton): patrón CLOSED → OPEN → HALF_OPEN keyeado por producto.
// Estado en Redis con fallback a un Map en memoria. Aquí forzamos el modo memoria
// (getClient → null) para ejercitar la máquina de estados sin BD ni red, y mockeamos
// ResilienceConfig con umbrales pequeños/deterministas. Cada test usa un producto distinto
// porque el Map en memoria del singleton persiste entre tests.

jest.mock('shared/utils/redis.util', () => ({ getClient: jest.fn() }));

jest.mock('shared/utils/resilience-config.util', () => ({
  HARD_DEFAULTS: { circuitBreaker: { failureThreshold: 5, recoveryTimeMs: 60000, failuresTtlS: 300 } },
  get: jest.fn()
}));

jest.mock('shared/utils/logger.util', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { mocked } from 'tests/helpers/mock';
import redisClientModule = require('shared/utils/redis.util');
const redisClient = mocked(redisClientModule);
import ResilienceConfigModule = require('shared/utils/resilience-config.util');
const ResilienceConfig = mocked(ResilienceConfigModule);
import breaker = require('shared/utils/circuit-breaker.util');

// Umbrales de test: abre a los 3 fallos, recupera a los 1000 ms.
const THRESHOLDS = { failureThreshold: 3, recoveryTimeMs: 1000, failuresTtlS: 300 };

// Contador para nombres de producto únicos por test (evita contaminar el Map del singleton).
let productSeq = 0;
const nextProduct = () => `prod_${++productSeq}`;

describe('IntegrationCircuitBreaker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisClient.getClient.mockReturnValue(null); // modo memoria
    ResilienceConfig.get.mockResolvedValue({ circuitBreaker: { ...THRESHOLDS } });
  });

  describe('estado inicial', () => {
    it('canCall es true para un producto sin historial (CLOSED)', async () => {
      await expect(breaker.canCall(nextProduct())).resolves.toBe(true);
    });

    it('getStatus de un producto nuevo → CLOSED, 0 fallos, sin openedAt', async () => {
      const status = await breaker.getStatus(nextProduct());
      expect(status).toMatchObject({ status: 'CLOSED', failures: 0, openedAt: null, openedAtISO: null });
    });
  });

  describe('acumulación de fallos', () => {
    it('bajo el umbral no abre el circuito y cuenta los fallos', async () => {
      const p = nextProduct();
      await breaker.recordFailure(p);
      await breaker.recordFailure(p);
      const status = await breaker.getStatus(p);
      expect(status.status).toBe('CLOSED');
      expect(status.failures).toBe(2);
      await expect(breaker.canCall(p)).resolves.toBe(true);
    });

    it('al alcanzar el umbral abre el circuito y bloquea las llamadas', async () => {
      const p = nextProduct();
      await breaker.recordFailure(p);
      await breaker.recordFailure(p);
      await breaker.recordFailure(p); // 3 == umbral → OPEN

      const status = await breaker.getStatus(p);
      expect(status.status).toBe('OPEN');
      expect(typeof status.openedAt).toBe('number');
      expect(status.openedAtISO).toEqual(expect.any(String));

      // Inmediatamente después de abrir (elapsed < recoveryTimeMs) la llamada se bloquea.
      await expect(breaker.canCall(p)).resolves.toBe(false);
    });
  });

  describe('recuperación (OPEN → HALF_OPEN → CLOSED)', () => {
    it('tras el tiempo de recuperación canCall pasa a HALF_OPEN y deja pasar una prueba', async () => {
      const p = nextProduct();
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(0);
      try {
        // Abrimos el circuito en t=0.
        await breaker.recordFailure(p);
        await breaker.recordFailure(p);
        await breaker.recordFailure(p);
        expect((await breaker.getStatus(p)).status).toBe('OPEN');

        // Antes de recoveryTimeMs → sigue bloqueado.
        nowSpy.mockReturnValue(500);
        await expect(breaker.canCall(p)).resolves.toBe(false);

        // Pasado recoveryTimeMs → deja pasar la prueba y transiciona a HALF_OPEN.
        nowSpy.mockReturnValue(1500);
        await expect(breaker.canCall(p)).resolves.toBe(true);
        expect((await breaker.getStatus(p)).status).toBe('HALF_OPEN');
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('recordSuccess desde HALF_OPEN cierra el circuito y limpia los fallos', async () => {
      const p = nextProduct();
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(0);
      try {
        await breaker.recordFailure(p);
        await breaker.recordFailure(p);
        await breaker.recordFailure(p);
        nowSpy.mockReturnValue(2000);
        await breaker.canCall(p); // → HALF_OPEN
        expect((await breaker.getStatus(p)).status).toBe('HALF_OPEN');

        await breaker.recordSuccess(p);
        const status = await breaker.getStatus(p);
        expect(status.status).toBe('CLOSED');
        expect(status.failures).toBe(0);
      } finally {
        nowSpy.mockRestore();
      }
    });
  });

  describe('callbacks RF-USR-07', () => {
    afterEach(() => breaker.registerCallbacks({})); // desregistra para no afectar otros tests

    it('invoca onOpen cuando el circuito se abre', async () => {
      const onOpen = jest.fn();
      breaker.registerCallbacks({ onOpen });
      const p = nextProduct();

      await breaker.recordFailure(p);
      await breaker.recordFailure(p);
      await breaker.recordFailure(p);

      // El callback se dispara con setImmediate → esperamos un tick.
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
      expect(onOpen).toHaveBeenCalledWith(p, expect.any(Number));
    });

    it('invoca onClose al recuperarse desde HALF_OPEN', async () => {
      const onClose = jest.fn();
      breaker.registerCallbacks({ onClose });
      const p = nextProduct();
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(0);
      try {
        await breaker.recordFailure(p);
        await breaker.recordFailure(p);
        await breaker.recordFailure(p);
        nowSpy.mockReturnValue(3000);
        await breaker.canCall(p); // → HALF_OPEN
        await breaker.recordSuccess(p); // → CLOSED

        await new Promise((resolve) => {
        setImmediate(resolve);
      });
        expect(onClose).toHaveBeenCalledWith(p, expect.any(Number));
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('registerCallbacks es opcional (no lanza con objeto vacío)', () => {
      expect(() => breaker.registerCallbacks({})).not.toThrow();
      expect(() => breaker.registerCallbacks()).not.toThrow();
    });
  });

  describe('camino Redis', () => {
    it('usa el cliente Redis cuando está disponible (incr/get)', async () => {
      const store = new Map();
      const fakeRedis = {
        get: jest.fn((k) => (store.has(k) ? store.get(k) : null)),
        set: jest.fn((k, v) => store.set(k, v)),
        incr: jest.fn((k) => {
          const n = (Number.parseInt(store.get(k), 10) || 0) + 1;
          store.set(k, String(n));
          return n;
        }),
        expire: jest.fn(() => 1),
        del: jest.fn((...keys) => keys.forEach((k) => store.delete(k)))
      };
      redisClient.getClient.mockReturnValue(fakeRedis);

      const p = nextProduct();
      await breaker.recordFailure(p);
      expect(fakeRedis.incr).toHaveBeenCalled();
      expect((await breaker.getStatus(p)).failures).toBe(1);
    });

    it('si Redis lanza en getState, degrada a memoria sin propagar el error', async () => {
      const fakeRedis = {
        get: jest.fn(() => Promise.reject(new Error('redis down'))),
        set: jest.fn(),
        incr: jest.fn(),
        expire: jest.fn(),
        del: jest.fn()
      };
      redisClient.getClient.mockReturnValue(fakeRedis);
      // No lanza y responde con el default de memoria (CLOSED → true).
      await expect(breaker.canCall(nextProduct())).resolves.toBe(true);
    });
  });
});
