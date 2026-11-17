// El JSONB integration_resilience se persiste en snake_case (con circuit_breaker anidado).
// Se convierte a camelCase para la respuesta al cliente (nunca se asigna crudo).
/** JSONB system_global_config.integration_resilience (snake_case). */
interface StoredResilience {
  timeout_ms?: number;
  manual_review_timeout_ms?: number;
  max_retries?: number;
  circuit_breaker?: { failure_threshold?: number; recovery_time_ms?: number; failures_ttl_s?: number };
}

interface SystemGlobalConfigRow {
  config_id: string;
  config_version: number | string;
  currency: string;
  audit_retention_hot_years: number;
  audit_retention_cold_years: number;
  audit_hot_purge_enabled?: boolean | null;
  /** JSONB: el modelo lo tipa unknown; la forma la describe StoredResilience */
  integration_resilience?: unknown;
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
      configId: record.config_id,
      configVersion: record.config_version,
      currency: record.currency,
      auditRetentionHotYears: record.audit_retention_hot_years,
      auditRetentionColdYears: record.audit_retention_cold_years,
      auditHotPurgeEnabled: record.audit_hot_purge_enabled ?? false,
      integrationResilience: _buildIntegrationResilience(record.integration_resilience)
    };
  }
}

export default { SystemGlobalConfigComponent };
