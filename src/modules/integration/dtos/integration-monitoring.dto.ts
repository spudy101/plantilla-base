import type { ProviderFallbackEvent } from '../../../shared/database/generated/prisma/client';
import type { IntegrationLogRow } from '../repositories/integration-api-log.repository';
import type { IntegrationApiLogRepositoryPort } from '../../repository-ports';
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
  recentFallbacks: ProviderFallbackEvent[];
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
function IntegrationLogListItemDTO(row: IntegrationLogRow) {
  return {
    apiLogId: row.apiLogId,
    product: row.product,
    endpoint: row.endpoint,
    result: row.result,
    responseTimeMs: row.responseTimeMs,
    errorCode: row.errorCode,
    isSystemError: row.isSystemError,
    notificationId: row.notificationId,
    createdAt: row.createdAt,
    user: row.user ? { userId: row.user.userId, username: row.user.username } : null,
    session: row.session
      ? {
          sessionId: row.session.userSessionId,
          ipAddress: row.session.ipAddress,
          userAgent: row.session.userAgent,
          status: row.session.status,
          startedAt: row.session.startedAt
        }
      : null
  };
}

// Detalle forense de una llamada: agrega los payloads sanitizados.
function IntegrationLogDetailDTO(row: IntegrationLogRow) {
  return {
    ...IntegrationLogListItemDTO(row),
    errorMessage: row.errorMessage,
    requestPayload: row.requestPayload,
    responsePayload: row.responsePayload
  };
}

function FallbackEventDTO(row: ProviderFallbackEvent) {
  const startedAt = row.startedAt ? new Date(row.startedAt) : null;
  const endedAt = row.endedAt ? new Date(row.endedAt) : null;
  const MS_PER_SECOND = 1000;
  return {
    fallbackEventId: row.fallbackEventId,
    provider: row.provider,
    circuitProduct: row.circuitProduct,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    active: row.endedAt === null,
    durationSeconds: startedAt && endedAt ? Math.round((endedAt.getTime() - startedAt.getTime()) / MS_PER_SECOND) : null,
    affectedProcessesCount: row.affectedProcessesCount
  };
}

export default {
  IntegrationDashboardDTO,
  buildProductView,
  IntegrationLogListItemDTO,
  IntegrationLogDetailDTO,
  FallbackEventDTO
};
