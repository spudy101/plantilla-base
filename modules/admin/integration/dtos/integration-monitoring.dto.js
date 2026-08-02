// DTOs del monitoreo de integraciones externas (solo AWS). Vistas de solo lectura: el template
// no gestiona integraciones, solo las observa.

function _circuitView(circuit) {
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
function _availability(circuit, stat, minSuccessRate) {
  if (circuit?.status === 'OPEN') {
    return 'No disponible';
  }
  if (circuit?.status === 'HALF_OPEN' || (stat && stat.success + stat.failed > 0 && stat.successRate < minSuccessRate)) {
    return 'Degradado';
  }
  return 'Disponible';
}

function IntegrationDashboardDTO({ summary, products, activeFallbacks, recentFallbacks, meta, minSuccessRate }) {
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
function buildProductView(stat, circuit, minSuccessRate) {
  return {
    ...stat,
    circuit: _circuitView(circuit),
    availabilityStatus: _availability(circuit, stat, minSuccessRate)
  };
}

// Ítem del drill-down por llamada: incluye QUIÉN llamó y en QUÉ sesión (lo que pediste ver).
function IntegrationLogListItemDTO(row) {
  return {
    apiLogId: row.api_log_id,
    product: row.product,
    endpoint: row.endpoint,
    result: row.result,
    responseTimeMs: row.response_time_ms,
    errorCode: row.error_code,
    isSystemError: row.is_system_error,
    notificationId: row.notification_id,
    createdAt: row.created_at,
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
function IntegrationLogDetailDTO(row) {
  return {
    ...IntegrationLogListItemDTO(row),
    errorMessage: row.error_message,
    requestPayload: row.request_payload,
    responsePayload: row.response_payload
  };
}

function FallbackEventDTO(row) {
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
    durationSeconds: startedAt && endedAt ? Math.round((endedAt - startedAt) / MS_PER_SECOND) : null,
    affectedProcessesCount: row.affected_processes_count
  };
}

module.exports = {
  IntegrationDashboardDTO,
  buildProductView,
  IntegrationLogListItemDTO,
  IntegrationLogDetailDTO,
  FallbackEventDTO
};
