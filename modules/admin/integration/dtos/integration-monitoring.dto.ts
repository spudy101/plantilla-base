import type defineIntegrationApiLog = require('../../../schemas/integration/models/integration-api-log.model');
import type defineProviderFallbackEvent = require('../../../schemas/integration/models/provider-fallback-event.model');
import type { IntegrationApiLogRepositoryPort } from '../../../schemas/repository-ports';
// DTOs del monitoreo de integraciones externas (solo AWS). Vistas de solo lectura: el template
// no gestiona integraciones, solo las observa.

/** Estado del circuito tal como lo expone CircuitBreaker.getStatus(). */
interface CircuitStatus {
  status: string;
  failures: number;
  openedAtISO?: string | null;
}

/** Métricas de un producto (IntegrationApiLogRepository.getStats().byProduct). */
type ProductStats = IntegrationApiLogRepositoryPort extends { getStats(...a: never[]): Promise<{ byProduct: Record<string, infer P> }> } ? P : never;

function _circuitView(circuit: CircuitStatus | null | undefined) {
  if (!circuit) {
    return { state: 'CLOSED', failures: 0, openedAt: null };
  }
  return {
    state: circuit.status,
    failures: circuit.failures,
    openedAt: circuit.openedAtISO ?? null
  };
}

// Semáforo de disponibilidad por producto a partir del estado del circuito + % de éxito reciente.
function _availability(circuit: CircuitStatus | null | undefined, stat: ProductStats | null | undefined, minSuccessRate: number) {
  if (circuit?.status === 'OPEN') {
    return 'No disponible';
  }
  if (circuit?.status === 'HALF_OPEN' || (stat && stat.success + stat.failed > 0 && stat.successRate < minSuccessRate)) {
    return 'Degradado';
  }
  return 'Disponible';
}

function IntegrationDashboardDTO({
  summary,
  products,
  activeFallbacks,
  recentFallbacks,
  meta,
  minSuccessRate
}: {
  summary: Record<string, unknown>;
  products: Array<ReturnType<typeof buildProductView>>;
  activeFallbacks: number;
  recentFallbacks: defineProviderFallbackEvent.Instance[];
  meta: { from: unknown; to: unknown; generatedAt: string };
  minSuccessRate: number;
}) {
  return {
    summary: {
      ...summary,
      activeFallbacks,
      degraded: products.filter(p => p.availabilityStatus === 'Degradado' || p.availabilityStatus === 'No disponible').length
    },
    products: products.map(p => ({
      product: p.product,
      availabilityStatus: p.availabilityStatus,
      circuit: p.circuit,
      totalCalls: p.total,
      success: p.success,
      failed: p.failed,
      circuitOpen: p.circuitOpen,
      systemError: p.systemError,
      successRate: p.successRate,
      avgResponseMs: p.avgResponseMs
    })),
    recentFallbacks: recentFallbacks.map(FallbackEventDTO),
    metadata: {
      from: meta.from,
      to: meta.to,
      generatedAt: meta.generatedAt,
      minSuccessRate
    }
  };
}

// Combina las métricas del producto con el estado del circuito y el semáforo de disponibilidad.
function buildProductView(stat: ProductStats, circuit: CircuitStatus | null | undefined, minSuccessRate: number) {
  return {
    ...stat,
    circuit: _circuitView(circuit),
    availabilityStatus: _availability(circuit, stat, minSuccessRate)
  };
}

// Ítem del drill-down por llamada: incluye QUIÉN llamó y en QUÉ sesión (lo que pediste ver).
function IntegrationLogListItemDTO(row: defineIntegrationApiLog.Instance) {
  return {
    apiLogId: row.api_log_id,
    product: row.product,
    endpoint: row.endpoint,
    result: row.result,
    responseTimeMs: row.response_time_ms,
    errorCode: row.error_code,
    isSystemError: row.is_system_error,
    notificationId: row.notification_id,
    // Atributo del modelo underscored (antes row.created_at → siempre undefined)
    createdAt: row.createdAt,
    user: row.user ? { userId: row.user.user_id, username: row.user.username } : null,
    session: row.session
      ? {
          sessionId: row.session.user_session_id,
          ipAddress: row.session.ip_address,
          userAgent: row.session.user_agent,
          status: row.session.status,
          startedAt: row.session.started_at
        }
      : null
  };
}

// Detalle forense de una llamada: agrega los payloads sanitizados.
function IntegrationLogDetailDTO(row: defineIntegrationApiLog.Instance) {
  return {
    ...IntegrationLogListItemDTO(row),
    errorMessage: row.error_message,
    requestPayload: row.request_payload,
    responsePayload: row.response_payload
  };
}

function FallbackEventDTO(row: defineProviderFallbackEvent.Instance) {
  const startedAt = row.started_at ? new Date(row.started_at) : null;
  const endedAt = row.ended_at ? new Date(row.ended_at) : null;
  const MS_PER_SECOND = 1000;
  return {
    fallbackEventId: row.fallback_event_id,
    provider: row.provider,
    circuitProduct: row.circuit_product,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    active: row.ended_at === null,
    durationSeconds: startedAt && endedAt ? Math.round((endedAt.getTime() - startedAt.getTime()) / MS_PER_SECOND) : null,
    affectedProcessesCount: row.affected_processes_count
  };
}

export = {
  IntegrationDashboardDTO,
  buildProductView,
  IntegrationLogListItemDTO,
  IntegrationLogDetailDTO,
  FallbackEventDTO
};
