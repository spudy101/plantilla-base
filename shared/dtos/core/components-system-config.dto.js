// El JSONB integration_resilience se persiste en snake_case (con circuit_breaker anidado).
// Se convierte a camelCase para la respuesta al cliente (nunca se asigna crudo).
function _buildIntegrationResilience(resilience) {
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
  static build(record) {
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

module.exports = { SystemGlobalConfigComponent };
