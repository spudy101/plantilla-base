// tests/unit/modules/schemas/notification/services/notification-rate-limit.service.test.js
//
// NotificationRateLimitService — ventana deslizante por minuto para no exceder las cuotas de
// AWS SNS/SES. Probamos: la clave se deriva del minuto actual, el conteo se incrementa por el
// tamaño de lote de cada canal, y el gate espera (backoff hasta el fin del minuto) sólo cuando el
// conteo alcanza el límite. Espiamos `_sleep` para no bloquear el reloj real y fijamos `Date.now()`
// para tener una clave/minuto determinista.

jest.mock('shared/utils/logger.util', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

const { logger } = require('shared/utils/logger.util');
const rateLimit = require('modules/schemas/notification/services/notification-rate-limit.service');

const ONE_MINUTE_MS = 60 * 1000;
// Un instante fijo dentro de un minuto: now % 60000 = 20000 → waitTime esperado = 40000.
const FIXED_NOW = 90 * ONE_MINUTE_MS + 20 * 1000;
const MINUTE = Math.floor(FIXED_NOW / ONE_MINUTE_MS);
const EXPECTED_WAIT = ONE_MINUTE_MS - (FIXED_NOW % ONE_MINUTE_MS);

function makeCache() {
  return { get: jest.fn(), set: jest.fn().mockResolvedValue(undefined) };
}

describe('NotificationRateLimitService', () => {
  let sleepSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    sleepSpy = jest.spyOn(rateLimit, '_sleep').mockResolvedValue(undefined);
  });

  afterEach(() => {
    Date.now.mockRestore();
    sleepSpy.mockRestore();
  });

  describe('checkSNSRateLimit', () => {
    it('deriva la clave del minuto actual e incrementa el conteo en el tamaño de lote (100)', async () => {
      const cache = makeCache();
      cache.get.mockResolvedValue('50');

      await rateLimit.checkSNSRateLimit(cache);

      expect(cache.get).toHaveBeenCalledWith(`aws_sns_rate:${MINUTE}`);
      expect(cache.set).toHaveBeenCalledWith(`aws_sns_rate:${MINUTE}`, 150, 120);
      expect(sleepSpy).not.toHaveBeenCalled();
    });

    it('trata la ausencia de valor en cache como conteo 0', async () => {
      const cache = makeCache();
      cache.get.mockResolvedValue(null);

      await rateLimit.checkSNSRateLimit(cache);

      expect(cache.set).toHaveBeenCalledWith(`aws_sns_rate:${MINUTE}`, 100, 120);
      expect(sleepSpy).not.toHaveBeenCalled();
    });

    it('espera hasta el fin del minuto cuando alcanza el límite (300) y avisa', async () => {
      const cache = makeCache();
      cache.get.mockResolvedValue('300');

      await rateLimit.checkSNSRateLimit(cache);

      expect(sleepSpy).toHaveBeenCalledWith(EXPECTED_WAIT);
      expect(logger.warn).toHaveBeenCalled();
      // Tras esperar, igual registra el nuevo lote.
      expect(cache.set).toHaveBeenCalledWith(`aws_sns_rate:${MINUTE}`, 400, 120);
    });
  });

  describe('checkSESRateLimit', () => {
    it('incrementa el conteo en el tamaño de lote de email (50)', async () => {
      const cache = makeCache();
      cache.get.mockResolvedValue('30');

      await rateLimit.checkSESRateLimit(cache);

      expect(cache.get).toHaveBeenCalledWith(`aws_ses_rate:${MINUTE}`);
      expect(cache.set).toHaveBeenCalledWith(`aws_ses_rate:${MINUTE}`, 80, 120);
      expect(sleepSpy).not.toHaveBeenCalled();
    });

    it('espera cuando alcanza el límite de SES (200)', async () => {
      const cache = makeCache();
      cache.get.mockResolvedValue('200');

      await rateLimit.checkSESRateLimit(cache);

      expect(sleepSpy).toHaveBeenCalledWith(EXPECTED_WAIT);
      expect(logger.warn).toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalledWith(`aws_ses_rate:${MINUTE}`, 250, 120);
    });
  });
});
