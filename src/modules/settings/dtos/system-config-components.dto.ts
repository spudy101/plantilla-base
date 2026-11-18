// El JSONB integration_resilience se persiste en snake_case (con circuit_breaker anidado).
// Se convierte a camelCase para la respuesta al cliente (nunca se asigna crudo).
/** JSONB system_global_config.integration_resilience (snake_case). */
interface StoredResilience {
  timeout_ms?: number;
  manual_review_timeout_ms?: number;
  max_retries?: number;
  circuit_breaker?: { failure_threshold?: number; recovery_time_ms?: number; failures_ttl_s?: number };
}

/** Fila de Prisma (fase 5, grupo 4). El contenido de integrationResilience sigue en snake_case. */
interface SystemGlobalConfigRow {
  configId: string;
  configVersion: number | string;
  currency: string;
  auditRetentionHotYears: number;
  auditRetentionColdYears: number;
  auditHotPurgeEnabled?: boolean | null;
  /** JSONB: la forma la describe StoredResilience */
  integrationResilience?: unknown;
}

function _buildIntegrationResilience(raw: unknown) {
  const resilience = raw as StoredResilience | null | undefined;
  if (!resilience || Object.keys(resilience).length === 0) {
    return {};
  }
  const cb = resilience.circuit_breaker ?? {};
  return {
    timeoutMs: resilience.timeout_ms ?? null,
    manualReviewTimeoutMs: resilience.manual_review_timeout_ms ?? null,
    maxRetries: resilience.max_retries ?? null,
    circuitBreaker: {
      failureThreshold: cb.failure_threshold ?? null,
      recoveryTimeMs: cb.recovery_time_ms ?? null,
      failuresTtlS: cb.failures_ttl_s ?? null
    }
  };
}

class SystemGlobalConfigComponent {
  static build(record: SystemGlobalConfigRow | null | undefined) {
    if (!record) {
      return null;
    }
    return {
      configId: record.configId,
      configVersion: record.configVersion,
      currency: record.currency,
      auditRetentionHotYears: record.auditRetentionHotYears,
      auditRetentionColdYears: record.auditRetentionColdYears,
      auditHotPurgeEnabled: record.auditHotPurgeEnabled ?? false,
      integrationResilience: _buildIntegrationResilience(record.integrationResilience)
    };
  }
}

export default { SystemGlobalConfigComponent };
