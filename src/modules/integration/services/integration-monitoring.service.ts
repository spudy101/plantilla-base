// Servicio de monitoreo de integraciones externas (solo AWS). Solo lectura: agrega la bitácora
// central (integration_api_logs) + el estado del circuit breaker + el historial de fallbacks.
// No gestiona integraciones — se controlan por código.

import CircuitBreaker from '../../../shared/infra/circuit-breaker.util';
import integrationApiLogRepository from '../repositories/integration-api-log.repository';
import providerFallbackRepository from '../repositories/provider-fallback-event.repository';
import PaginationHelper from '../../../shared/http/pagination.util';
import catalogsModule from '../../catalogs';
const { catalogComponentsDto: componentsCatalogDtoModule } = catalogsModule;
const { MetadataDTO } = componentsCatalogDtoModule;
import AppError from '../../../shared/http/app-error.util';
import integrationMonitoringDtoModule from '../dtos/integration-monitoring.dto';
import auditModule from '../../audit';
const { audit } = auditModule;
const {
  IntegrationDashboardDTO,
  buildProductView,
  IntegrationLogListItemDTO,
  IntegrationLogDetailDTO,
  FallbackEventDTO
} = integrationMonitoringDtoModule;

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const MIN_SUCCESS_RATE = 90;
const RECENT_FALLBACKS_LIMIT = 10;

const ENTITY = { entityType: 'IntegrationApiLog', entityTable: 'integration_api_logs' };
const FALLBACK_ENTITY = { entityType: 'ProviderFallbackEvent', entityTable: 'provider_fallback_events' };

class IntegrationMonitoringService {
  integrationApiLogRepository: typeof integrationApiLogRepository;
  providerFallbackRepository: typeof providerFallbackRepository;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new IntegrationMonitoringService({ integrationApiLogRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps: IntegrationMonitoringService.Deps = {}) {
    this.integrationApiLogRepository = deps.integrationApiLogRepository ?? integrationApiLogRepository;
    this.providerFallbackRepository = deps.providerFallbackRepository ?? providerFallbackRepository;
  }

  /**
   * Dashboard: métricas por producto (nº llamadas, % éxito, tiempo prom, errores) + estado del
   * circuito + fallbacks activos e historial reciente.
   */
  async getDashboard(query: Record<string, unknown>, adminUserId: string) {
    const now = new Date();
    const fromParam = PaginationHelper.stringParam(query, 'from');
    const toParam = PaginationHelper.stringParam(query, 'to');
    const from = fromParam ? new Date(fromParam) : new Date(now.getTime() - TWENTY_FOUR_HOURS_MS);
    const to = toParam ? new Date(toParam) : now;

    const { products } = this.integrationApiLogRepository;

    const [stats, circuitStatuses, activeFallbacks, recentFallbacks] = await Promise.all([
      this.integrationApiLogRepository.getStats({ from: from.toISOString(), to: to.toISOString() }),
      Promise.all(products.map(p => CircuitBreaker.getStatus(p))),
      this.providerFallbackRepository.countActive(),
      this.providerFallbackRepository.findRecent(RECENT_FALLBACKS_LIMIT)
    ]);

    const circuitMap = new Map(circuitStatuses.map(cs => [cs.product, cs]));

    const productViews = products.map(p => buildProductView(stats.byProduct[p], circuitMap.get(p), MIN_SUCCESS_RATE));

    await audit.record('INTEGRATION_DASHBOARD_VIEWED', {
      actorId: adminUserId,
      details: { from: from.toISOString(), to: to.toISOString() },
      ...ENTITY
    });

    return IntegrationDashboardDTO({
      summary: stats.summary,
      products: productViews,
      activeFallbacks,
      recentFallbacks,
      meta: { from, to, generatedAt: now.toISOString() },
      minSuccessRate: MIN_SUCCESS_RATE
    });
  }

  /**
   * Estado del circuit breaker por producto (semáforo en tiempo real). Vista ligera para health.
   */
  async getProvidersHealth(adminUserId: string) {
    const { products } = this.integrationApiLogRepository;
    const now = new Date();
    const since24h = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS);

    const [stats, circuitStatuses] = await Promise.all([
      this.integrationApiLogRepository.getStats({ from: since24h.toISOString(), to: now.toISOString() }),
      Promise.all(products.map(p => CircuitBreaker.getStatus(p)))
    ]);

    const circuitMap = new Map(circuitStatuses.map(cs => [cs.product, cs]));

    const providers = products.map(p => buildProductView(stats.byProduct[p], circuitMap.get(p), MIN_SUCCESS_RATE));
    const activeFallbacks = providers.filter(p => p.availabilityStatus === 'No disponible').length;

    await audit.record('PROVIDER_HEALTH_DASHBOARD_VIEWED', {
      actorId: adminUserId,
      details: { activeFallbacks },
      ...ENTITY
    });

    return {
      providers: providers.map(p => ({
        product: p.product,
        availabilityStatus: p.availabilityStatus,
        circuit: p.circuit,
        successRate: p.successRate,
        avgResponseMs: p.avgResponseMs
      })),
      activeFallbacks,
      generatedAt: now
    };
  }

  /**
   * Drill-down paginado por llamada, con el usuario y la sesión que la originaron.
   */
  async getLogs(query: Record<string, unknown>, adminUserId: string) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const filters = {
      product: PaginationHelper.stringParam(query, 'product'),
      result: PaginationHelper.stringParam(query, 'result'),
      userId: PaginationHelper.stringParam(query, 'userId'),
      sessionId: PaginationHelper.stringParam(query, 'sessionId'),
      from: PaginationHelper.stringParam(query, 'from'),
      to: PaginationHelper.stringParam(query, 'to')
    };

    const { rows, count } = await this.integrationApiLogRepository.findAllPaginated(filters, paginationParams);

    await audit.record('INTEGRATION_LOGS_VIEWED', {
      actorId: adminUserId,
      details: { totalItems: count },
      ...ENTITY
    });

    const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== null));

    return {
      data: rows.map(IntegrationLogListItemDTO),
      metadata: MetadataDTO.build({
        totalItems: count,
        page: paginationParams.page,
        limit: paginationParams.limit,
        sortBy: paginationParams.sortBy,
        order: paginationParams.order,
        filters: Object.keys(activeFilters).length > 0 ? activeFilters : undefined
      })
    };
  }

  async getLogDetail(apiLogId: string, adminUserId: string) {
    const record = await this.integrationApiLogRepository.findById(apiLogId);
    if (!record) {
      throw AppError.notFound('Registro de llamada no encontrado');
    }

    await audit.record('INTEGRATION_LOG_DETAIL_VIEWED', {
      actorId: adminUserId,
      details: { apiLogId },
      ...ENTITY,
      entityId: apiLogId
    });

    return IntegrationLogDetailDTO(record);
  }

  /**
   * Historial paginado de eventos de fallback (ventanas de caída con duración).
   */
  async getFallbackHistory(query: Record<string, unknown>, adminUserId: string) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const filters = {
      provider: PaginationHelper.stringParam(query, 'provider'),
      activeOnly: query.activeOnly === 'true',
      from: PaginationHelper.stringParam(query, 'from'),
      to: PaginationHelper.stringParam(query, 'to')
    };

    const { rows, count } = await this.providerFallbackRepository.findAllPaginated(filters, paginationParams);

    await audit.record('PROVIDER_FALLBACK_HISTORY_VIEWED', {
      actorId: adminUserId,
      details: { totalItems: count },
      ...FALLBACK_ENTITY
    });

    const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== null && v !== false));

    return {
      data: rows.map(FallbackEventDTO),
      metadata: MetadataDTO.build({
        totalItems: count,
        page: paginationParams.page,
        limit: paginationParams.limit,
        sortBy: paginationParams.sortBy,
        order: paginationParams.order,
        filters: Object.keys(activeFilters).length > 0 ? activeFilters : undefined
      })
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace IntegrationMonitoringService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    integrationApiLogRepository?: typeof integrationApiLogRepository;
    providerFallbackRepository?: typeof providerFallbackRepository;
  }
}

export default Object.assign(new IntegrationMonitoringService(), { IntegrationMonitoringService });
