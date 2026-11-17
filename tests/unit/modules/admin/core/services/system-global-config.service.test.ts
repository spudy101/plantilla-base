// tests/unit/modules/admin/core/services/system-global-config.service.test.ts
//
// SystemGlobalConfigService — lectura/actualización de la configuración global del sistema (única
// fila activa). Probamos: getConfig (feliz + 404 si no hay config activa); updateConfig con la config
// existente (arma el payload, incrementa version, audita, notifica) y la rama donde no existe config
// activa (la crea con defaults). El merge parcial de integration_resilience (camelCase→snake_case,
// con circuit_breaker anidado) se verifica capturando el payload de config.update. Modelo Sequelize,
// DTO, request-context, notificaciones y logger se mockean. La notificación sale en setImmediate.

jest.mock('shared/utils/app-error.util', () => ({
  notFound: (msg: Loose) => Object.assign(new Error(msg), { statusCode: 404 })
}));

jest.mock('shared/utils/logger.util', () => ({
  logAudit: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('shared/utils/request-context.util', () => ({
  originFromContext: jest.fn().mockReturnValue({ origin_session: 'sess-1' })
}));

// El service ya no toca el modelo de Sequelize: depende del repositorio (SOLID: D).
jest.mock('modules/schemas/core/repositories/system-global-config.repository', () => ({
  findActive: jest.fn(),
  createActive: jest.fn()
}));

jest.mock('modules/admin/core/dtos/system-global-config.dto', () => ({
  SystemGlobalConfigDTO: (record: Loose) => ({ dto: 'config', ...record })
}));

jest.mock('modules/schemas/notification/services/notification-creation.service', () => ({
  crearNotificacion: jest.fn().mockResolvedValue(undefined)
}));

import { mocked, Loose, fixture } from 'tests/helpers/mock';
import loggerUtilModule from 'shared/utils/logger.util';
const { logAudit } = mocked(loggerUtilModule);
import systemGlobalConfigRepositoryModule from 'modules/schemas/core/repositories/system-global-config.repository';
const systemGlobalConfigRepository = mocked(systemGlobalConfigRepositoryModule);
import notificationCreationServiceModule from 'modules/schemas/notification/services/notification-creation.service';
const notificationCreationService = mocked(notificationCreationServiceModule);
import service from 'modules/admin/core/services/system-global-config.service';

const flush = () => new Promise(resolve => { setImmediate(resolve); });

// Fábrica de config activa con un método update que devuelve la versión "actualizada".
const makeConfig = (over = {}) => {
  const base: Record<string, Loose> = {
    config_id: 'cfg-1',
    config_version: 3,
    integration_resilience: { timeout_ms: 1000, circuit_breaker: { failure_threshold: 5, recovery_time_ms: 30000 } },
    ...over
  };
  base.update = jest.fn(payload => Promise.resolve({ ...base, ...payload }));
  return base;
};

describe('SystemGlobalConfigService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // getConfig
  // ============================================================

  describe('getConfig', () => {
    it('devuelve la config activa y audita la lectura', async () => {
      systemGlobalConfigRepository.findActive.mockResolvedValue(makeConfig());

      const result = await service.getConfig('admin-1');

      expect(systemGlobalConfigRepository.findActive).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith('SYSTEM_GLOBAL_CONFIG_VIEWED', 'admin-1', {}, expect.objectContaining({ entityId: 'cfg-1' }));
      expect(result).toMatchObject({ dto: 'config', config_id: 'cfg-1' });
    });

    it('lanza (404) si no hay configuración global activa', async () => {
      systemGlobalConfigRepository.findActive.mockResolvedValue(null);
      await expect(service.getConfig('admin-1')).rejects.toThrow(/No hay una configuración global activa/);
    });
  });

  // ============================================================
  // updateConfig
  // ============================================================

  describe('updateConfig', () => {
    it('actualiza campos simples, incrementa la versión, audita, notifica y devuelve el DTO', async () => {
      const config = makeConfig();
      systemGlobalConfigRepository.findActive.mockResolvedValue(config);

      const data = { currency: 'USD', auditRetentionHotYears: 2, auditHotPurgeEnabled: true };
      const result = await service.updateConfig(data, 'admin-1', fixture({}));

      const payload = config.update.mock.calls[0][0];
      expect(payload).toMatchObject({
        config_version: 4,
        currency: 'USD',
        audit_retention_hot_years: 2,
        audit_hot_purge_enabled: true
      });
      expect(logAudit).toHaveBeenCalledWith(
        'SYSTEM_GLOBAL_CONFIG_UPDATED',
        'admin-1',
        expect.objectContaining({ updatedFields: ['currency', 'auditRetentionHotYears', 'auditHotPurgeEnabled'], configVersion: { before: 3, after: 4 } }),
        expect.any(Object)
      );
      expect(result).toMatchObject({ dto: 'config', config_version: 4 });

      await flush();
      expect(notificationCreationService.crearNotificacion).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'SYSTEM_CONFIG_UPDATED_INTERNAL', userId: null })
      );
    });

    it('hace merge parcial de integration_resilience (camelCase→snake_case, circuit_breaker anidado, conserva lo no enviado)', async () => {
      const config = makeConfig();
      systemGlobalConfigRepository.findActive.mockResolvedValue(config);

      const data = {
        integrationResilience: {
          maxRetries: 4,
          circuitBreaker: { failureThreshold: 9 }
        }
      };
      await service.updateConfig(data, 'admin-1', fixture({}));

      const resilience = config.update.mock.calls[0][0].integration_resilience;
      // nuevos valores mapeados a snake_case
      expect(resilience.max_retries).toBe(4);
      expect(resilience.circuit_breaker.failure_threshold).toBe(9);
      // conserva lo previo no enviado
      expect(resilience.timeout_ms).toBe(1000);
      expect(resilience.circuit_breaker.recovery_time_ms).toBe(30000);
    });

    it('si no existe config activa la crea con defaults (advierte y usa origin del contexto)', async () => {
      systemGlobalConfigRepository.findActive.mockResolvedValue(null);
      systemGlobalConfigRepository.createActive.mockResolvedValue(makeConfig({ config_version: 0 }));

      const result = await service.updateConfig({ currency: 'CLP' }, 'admin-1', fixture({}));

      expect(systemGlobalConfigRepository.createActive).toHaveBeenCalledWith({ origin_session: 'sess-1' });
      expect(result).toMatchObject({ dto: 'config' });
    });
  });
});
