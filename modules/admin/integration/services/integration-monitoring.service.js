// Servicio de monitoreo de integraciones externas (solo AWS). Solo lectura: agrega la bitácora
// central (integration_api_logs) + el estado del circuit breaker + el historial de fallbacks.
// No gestiona integraciones — se controlan por código.

const CircuitBreaker = require('../../../../shared/utils/circuit-breaker.util');
const integrationApiLogRepository = require('../../../schemas/integration/repositories/integration-api-log.repository');
const providerFallbackRepository = require('../../../schemas/integration/repositories/provider-fallback-event.repository');
const PaginationHelper = require('../../../../shared/utils/pagination.util');
const { MetadataDTO } = require('../../../../shared/dtos/kyc/components-catalog.dto');
const AppError = require('../../../../shared/utils/app-error.util');
const { logAudit } = require('../../../../shared/utils/logger.util');
const {
  IntegrationDashboardDTO,
  buildProductView,
  IntegrationLogListItemDTO,
  IntegrationLogDetailDTO,
  FallbackEventDTO
} = require('../dtos/integration-monitoring.dto');

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const MIN_SUCCESS_RATE = 90;
const RECENT_FALLBACKS_LIMIT = 10;

const ENTITY = { entityType: 'IntegrationApiLog', entityTable: 'integration_api_logs' };
const FALLBACK_ENTITY = { entityType: 'ProviderFallbackEvent', entityTable: 'provider_fallback_events' };

class IntegrationMonitoringService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new IntegrationMonitoringService({ integrationApiLogRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.integrationApiLogRepository = deps.integrationApiLogRepository ?? integrationApiLogRepository;
    this.providerFallbackRepository = deps.providerFallbackRepository ?? providerFallbackRepository;
  }

  /**
   * Dashboard: métricas por producto (nº llamadas, % éxito, tiempo prom, errores) + estado del
   * circuito + fallbacks activos e historial reciente.
   */
  async getDashboard(query, adminUserId) {
    const now = new Date();
    const from = query.from ? new Date(query.from) : new Date(now.getTime() - TWENTY_FOUR_HOURS_MS);
    const to = query.to ? new Date(query.to) : now;

    const { products } = this.integrationApiLogRepository;

    const [stats, circuitStatuses, activeFallbacks, recentFallbacks] = await Promise.all([
      this.integrationApiLogRepository.getStats({ from: from.toISOString(), to: to.toISOString() }),
      Promise.all(products.map(p => CircuitBreaker.getStatus(p))),
      this.providerFallbackRepository.countActive(),
      this.providerFallbackRepository.findRecent(RECENT_FALLBACKS_LIMIT)
    ]);

    const circuitMap = {};
    for (const cs of circuitStatuses) {
      circuitMap[cs.product] = cs;
    }

    const productViews = products.map(p => buildProductView(stats.byProduct[p], circuitMap[p], MIN_SUCCESS_RATE));

    logAudit('INTEGRATION_DASHBOARD_VIEWED', adminUserId, { from: from.toISOString(), to: to.toISOString() }, { ...ENTITY });

    return IntegrationDashboardDTO({
      summary: stats.summary,
      products: productViews,
      activeFallbacks,
      recentFallbacks,
      meta: { from, to, generatedAt: now },
      minSuccessRate: MIN_SUCCESS_RATE
    });
  }

  /**
   * Estado del circuit breaker por producto (semáforo en tiempo real). Vista ligera para health.
   */
  async getProvidersHealth(adminUserId) {
    const { products } = this.integrationApiLogRepository;
    const now = new Date();
    const since24h = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS);

    const [stats, circuitStatuses] = await Promise.all([
      this.integrationApiLogRepository.getStats({ from: since24h.toISOString(), to: now.toISOString() }),
      Promise.all(products.map(p => CircuitBreaker.getStatus(p)))
    ]);

    const circuitMap = {};
    for (const cs of circuitStatuses) {
      circuitMap[cs.product] = cs;
    }

    const providers = products.map(p => buildProductView(stats.byProduct[p], circuitMap[p], MIN_SUCCESS_RATE));
    const activeFallbacks = providers.filter(p => p.availabilityStatus === 'No disponible').length;

    logAudit('PROVIDER_HEALTH_DASHBOARD_VIEWED', adminUserId, { activeFallbacks }, { ...ENTITY });

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
  async getLogs(query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const filters = {
      product: query.product || null,
      result: query.result || null,
      userId: query.userId || null,
      sessionId: query.sessionId || null,
      from: query.from || null,
      to: query.to || null
    };

    const { rows, count } = await this.integrationApiLogRepository.findAllPaginated(filters, paginationParams);

    logAudit('INTEGRATION_LOGS_VIEWED', adminUserId, { totalItems: count }, { ...ENTITY });

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

  async getLogDetail(apiLogId, adminUserId) {
    const record = await this.integrationApiLogRepository.findById(apiLogId);
    if (!record) {
      throw AppError.notFound('Registro de llamada no encontrado');
    }

    logAudit('INTEGRATION_LOG_DETAIL_VIEWED', adminUserId, { apiLogId }, { ...ENTITY, entityId: apiLogId });

    return IntegrationLogDetailDTO(record);
  }

  /**
   * Historial paginado de eventos de fallback (ventanas de caída con duración).
   */
  async getFallbackHistory(query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const filters = {
      provider: query.provider || null,
      activeOnly: query.activeOnly === 'true',
      from: query.from || null,
      to: query.to || null
    };

    const { rows, count } = await this.providerFallbackRepository.findAllPaginated(filters, paginationParams);

    logAudit('PROVIDER_FALLBACK_HISTORY_VIEWED', adminUserId, { totalItems: count }, { ...FALLBACK_ENTITY });

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

module.exports = new IntegrationMonitoringService();
module.exports.IntegrationMonitoringService = IntegrationMonitoringService;
