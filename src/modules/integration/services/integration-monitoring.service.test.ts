// tests/unit/modules/admin/integration/services/integration-monitoring.service.test.ts
//
// IntegrationMonitoringService — panel de solo-lectura sobre integraciones AWS. Probamos la
// orquestación: getDashboard agrega stats + estado de circuito + fallbacks y construye una vista por
// producto; getProvidersHealth deriva activeFallbacks contando los 'No disponible'; getLogs y
// getFallbackHistory arman filtros descartando los vacíos (y `false` en activeOnly); getLogDetail
// lanza 404 si no existe. Repos, CircuitBreaker, DTOs, paginación y logger se mockean.

jest.mock('../repositories/integration-api-log.repository', () => ({
  products: ['ses', 'sns'],
  getStats: jest.fn(),
  findAllPaginated: jest.fn(),
  findById: jest.fn()
}));

jest.mock('../repositories/provider-fallback-event.repository', () => ({
  countActive: jest.fn(),
  findRecent: jest.fn(),
  findAllPaginated: jest.fn()
}));

jest.mock('../../../shared/infra/circuit-breaker.util', () => ({
  getStatus: jest.fn(product => Promise.resolve({ product, state: 'closed' }))
}));

jest.mock('../../../shared/http/pagination.util', () => ({
  stringParam: jest.requireActual('../../../shared/http/pagination.util').default.stringParam,
  booleanParam: jest.requireActual('../../../shared/http/pagination.util').default.booleanParam,
  getPaginationParams: jest.fn().mockReturnValue({ limit: 20, offset: 0, page: 1, sortBy: 'created_at', order: 'DESC' })
}));

jest.mock('../../../shared/observability/logger.util', () => ({
  logAudit: jest.fn(),
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));
jest.mock('../../audit/audit.service', () => ({ record: jest.fn() }));

jest.mock('../../catalogs/responses/catalog-components.response', () => ({
  MetadataDTO: { build: (meta: Loose) => ({ ...meta }) }
}));

// DTOs a passthrough. buildProductView marca 'sns' como caído para ejercitar el conteo de fallbacks.
jest.mock('../responses/integration-monitoring.response', () => ({
  IntegrationDashboardDTO: (x: Loose) => x,
  buildProductView: jest.fn((stat, circuit) => ({
    product: circuit.product,
    availabilityStatus: circuit.product === 'sns' ? 'No disponible' : 'Disponible',
    circuit,
    successRate: 99,
    avgResponseMs: 120
  })),
  IntegrationLogListItemDTO: (row: Loose) => ({ item: true, ...row }),
  IntegrationLogDetailDTO: (row: Loose) => ({ detail: true, ...row }),
  FallbackEventDTO: (row: Loose) => ({ fallback: true, ...row })
}));

import { mocked, Loose } from 'tests/helpers/mock';
import apiLogRepoModule from '../repositories/integration-api-log.repository';
const apiLogRepo = mocked(apiLogRepoModule);
import fallbackRepoModule from '../repositories/provider-fallback-event.repository';
const fallbackRepo = mocked(fallbackRepoModule);
import CircuitBreakerModule from '../../../shared/infra/circuit-breaker.util';
const CircuitBreaker = mocked(CircuitBreakerModule);
import auditServiceModule from '../../audit/audit.service';
const logAudit = mocked(auditServiceModule).record;
import service from './integration-monitoring.service';

const ADMIN = 'admin-1';

function baseStats() {
  return {
    summary: { totalCalls: 10, successRate: 95 },
    byProduct: { ses: { calls: 6 }, sns: { calls: 4 } }
  };
}

describe('IntegrationMonitoringService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    CircuitBreaker.getStatus.mockImplementation(product => Promise.resolve({ product, state: 'closed' }));
  });

  describe('getDashboard', () => {
    it('agrega stats/circuito/fallbacks, construye una vista por producto y audita', async () => {
      apiLogRepo.getStats.mockResolvedValue(baseStats());
      fallbackRepo.countActive.mockResolvedValue(2);
      fallbackRepo.findRecent.mockResolvedValue([{ id: 'f-1' }]);

      // IntegrationDashboardDTO se mockea como identidad: el resultado es su entrada
      const result: Loose = await service.getDashboard({}, ADMIN);

      // Un estado de circuito por producto declarado en el repo.
      expect(CircuitBreaker.getStatus).toHaveBeenCalledTimes(2);
      expect(fallbackRepo.findRecent).toHaveBeenCalledWith(10);
      expect(result.products).toHaveLength(2);
      expect(result.summary).toEqual(baseStats().summary);
      expect(result.activeFallbacks).toBe(2);
      expect(logAudit).toHaveBeenCalledWith('INTEGRATION_DASHBOARD_VIEWED', expect.objectContaining({ actorId: ADMIN }));
    });

    it('usa la ventana de 24h por defecto cuando no llega rango', async () => {
      apiLogRepo.getStats.mockResolvedValue(baseStats());
      fallbackRepo.countActive.mockResolvedValue(0);
      fallbackRepo.findRecent.mockResolvedValue([]);

      await service.getDashboard({}, ADMIN);

      const { from, to } = apiLogRepo.getStats.mock.calls[0][0];
      expect(new Date(to).getTime() - new Date(from).getTime()).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('getProvidersHealth', () => {
    it('cuenta como activeFallbacks los productos "No disponible" y devuelve la vista ligera', async () => {
      apiLogRepo.getStats.mockResolvedValue(baseStats());

      const result: Loose = await service.getProvidersHealth(ADMIN);

      // Sólo 'sns' está caído según el mock de buildProductView.
      expect(result.activeFallbacks).toBe(1);
      expect(result.providers).toHaveLength(2);
      // La vista ligera expone sólo el subconjunto de campos, no el objeto completo.
      expect(Object.keys(result.providers[0]).sort()).toEqual(
        ['availabilityStatus', 'avgResponseMs', 'circuit', 'product', 'successRate'].sort()
      );
      expect(logAudit).toHaveBeenCalledWith('PROVIDER_HEALTH_DASHBOARD_VIEWED', expect.objectContaining({ actorId: ADMIN, details: { activeFallbacks: 1 } }));
    });
  });

  describe('getLogs', () => {
    it('arma filtros descartando los vacíos y mapea filas + metadata', async () => {
      apiLogRepo.findAllPaginated.mockResolvedValue({ rows: [{ api_log_id: 'l-1' }], count: 1 });

      const result = await service.getLogs({ product: 'ses' }, ADMIN);

      // El repo recibe todos los filtros (con null para los ausentes)...
      expect(apiLogRepo.findAllPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ product: 'ses', result: null, userId: null }),
        expect.any(Object)
      );
      expect(result.data).toEqual([{ item: true, api_log_id: 'l-1' }]);
      // ...pero la metadata sólo expone el filtro activo.
      expect(result.metadata.filters).toEqual({ product: 'ses' });
    });

    it('omite `filters` en metadata cuando no hay ninguno activo', async () => {
      apiLogRepo.findAllPaginated.mockResolvedValue({ rows: [], count: 0 });

      const result = await service.getLogs({}, ADMIN);

      expect(result.metadata.filters).toBeUndefined();
    });
  });

  describe('getLogDetail', () => {
    it('lanza 404 si el registro no existe', async () => {
      apiLogRepo.findById.mockResolvedValue(null);
      await expect(service.getLogDetail('l-x', ADMIN)).rejects.toMatchObject({ statusCode: 404 });
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('devuelve el detalle mapeado cuando existe', async () => {
      apiLogRepo.findById.mockResolvedValue({ api_log_id: 'l-1' });
      const result = await service.getLogDetail('l-1', ADMIN);
      expect(result).toEqual({ detail: true, api_log_id: 'l-1' });
      expect(logAudit).toHaveBeenCalledWith('INTEGRATION_LOG_DETAIL_VIEWED', expect.objectContaining({ actorId: ADMIN, details: { apiLogId: 'l-1' } }));
    });
  });

  describe('getFallbackHistory', () => {
    it('interpreta activeOnly y descarta null/false de los filtros activos', async () => {
      fallbackRepo.findAllPaginated.mockResolvedValue({ rows: [{ id: 'f-1' }], count: 1 });

      const result = await service.getFallbackHistory({ provider: 'sns', activeOnly: 'true' }, ADMIN);

      expect(fallbackRepo.findAllPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'sns', activeOnly: true, from: null, to: null }),
        expect.any(Object)
      );
      expect(result.data).toEqual([{ fallback: true, id: 'f-1' }]);
      expect(result.metadata.filters).toEqual({ provider: 'sns', activeOnly: true });
    });

    it('con activeOnly ausente (false) no lo lista como filtro activo', async () => {
      fallbackRepo.findAllPaginated.mockResolvedValue({ rows: [], count: 0 });

      const result = await service.getFallbackHistory({}, ADMIN);

      expect(result.metadata.filters).toBeUndefined();
    });
  });
});
