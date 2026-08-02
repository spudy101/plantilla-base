const AppError = require('../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../shared/utils/logger.util');
const requestContext = require('../../../../shared/utils/request-context.util');
const { SystemGlobalConfig } = require('../../../../shared/models');
const { SystemGlobalConfigDTO } = require('../dtos/system-global-config.dto');
const notificationCreationService = require('../../../schemas/notification/services/notification-creation.service');

const NOTIF_SYSTEM_CONFIG_UPDATED = 'SYSTEM_CONFIG_UPDATED_INTERNAL';

class SystemGlobalConfigService {
  async getConfig(adminUserId) {
    const config = await SystemGlobalConfig.findOne({ where: { is_active: true } });
    if (!config) {
      throw AppError.notFound('No hay una configuración global activa. Contacta al equipo de infraestructura.');
    }

    logAudit(
      'SYSTEM_GLOBAL_CONFIG_VIEWED',
      adminUserId,
      {},
      { entityId: config.config_id, entityType: 'SystemGlobalConfig', entityTable: 'system_global_config' }
    );

    return SystemGlobalConfigDTO(config);
  }

  async updateConfig(data, adminUserId, _auditCtx) {
    let config = await SystemGlobalConfig.findOne({ where: { is_active: true } });

    if (!config) {
      logger.warn('SystemGlobalConfigService.update — no existe config activa, creando con defaults');
      config = await SystemGlobalConfig.create({ is_active: true, ...requestContext.originFromContext() });
    }

    const updatePayload = _buildUpdatePayload(data, config);
    const previousVersion = config.config_version;

    const updated = await config.update(updatePayload);

    logAudit(
      'SYSTEM_GLOBAL_CONFIG_UPDATED',
      adminUserId,
      {
        updatedFields: Object.keys(data),
        configVersion: { before: previousVersion, after: updated.config_version }
      },
      { entityId: config.config_id, entityType: 'SystemGlobalConfig', entityTable: 'system_global_config' }
    );

    setImmediate(() => {
      notificationCreationService
        .crearNotificacion({
          tipoNotificacion: NOTIF_SYSTEM_CONFIG_UPDATED,
          userId: null,
          relatedEntity: { type: 'SystemGlobalConfig', id: config.config_id },
          metadata: {
            camposActualizados: Object.keys(data),
            versionAnterior: previousVersion,
            versionNueva: updated.config_version,
            adminUserId
          }
        })
        .catch(err => logger.warn('Error notificando actualización de config global', { error: err.message }));
    });

    logger.info('SystemGlobalConfigService.update', {
      adminUserId,
      fields: Object.keys(data),
      newVersion: updated.config_version
    });

    return SystemGlobalConfigDTO(updated);
  }
}

function _buildUpdatePayload(data, current) {
  const payload = { config_version: current.config_version + 1 };

  if (data.currency !== undefined) {
    payload.currency = data.currency;
  }
  if (data.auditRetentionHotYears !== undefined) {
    payload.audit_retention_hot_years = data.auditRetentionHotYears;
  }
  if (data.auditRetentionColdYears !== undefined) {
    payload.audit_retention_cold_years = data.auditRetentionColdYears;
  }
  if (data.auditHotPurgeEnabled !== undefined) {
    payload.audit_hot_purge_enabled = data.auditHotPurgeEnabled;
  }
  if (data.integrationResilience !== undefined) {
    payload.integration_resilience = _mergeResilience(current.integration_resilience, data.integrationResilience);
  }

  return payload;
}

// integration_resilience se persiste en snake_case (con circuit_breaker anidado). Merge parcial:
// convierte los camelCase entrantes a snake_case y conserva lo no enviado (incluye el sub-objeto
// circuit_breaker campo a campo). Mismo criterio de edición que integraciones.
function _mergeResilience(current, incoming) {
  const base = current ?? {};
  const merged = { ...base };

  if (incoming.timeoutMs !== undefined) {
    merged.timeout_ms = incoming.timeoutMs;
  }
  if (incoming.manualReviewTimeoutMs !== undefined) {
    merged.manual_review_timeout_ms = incoming.manualReviewTimeoutMs;
  }
  if (incoming.maxRetries !== undefined) {
    merged.max_retries = incoming.maxRetries;
  }

  if (incoming.circuitBreaker !== undefined) {
    const baseCb = base.circuit_breaker ?? {};
    const cb = { ...baseCb };
    if (incoming.circuitBreaker.failureThreshold !== undefined) {
      cb.failure_threshold = incoming.circuitBreaker.failureThreshold;
    }
    if (incoming.circuitBreaker.recoveryTimeMs !== undefined) {
      cb.recovery_time_ms = incoming.circuitBreaker.recoveryTimeMs;
    }
    if (incoming.circuitBreaker.failuresTtlS !== undefined) {
      cb.failures_ttl_s = incoming.circuitBreaker.failuresTtlS;
    }
    merged.circuit_breaker = cb;
  }

  return merged;
}

module.exports = new SystemGlobalConfigService();
