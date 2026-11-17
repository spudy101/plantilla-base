import type defineSystemGlobalConfig from '../../../schemas/core/models/system-global-config.model';
import type { AdminAuditContext } from '../../../../shared/types/audit-context';
import AppError from '../../../../shared/utils/app-error.util';
import loggerUtilModule from '../../../../shared/utils/logger.util';
const { logger, logAudit } = loggerUtilModule;
import requestContext from '../../../../shared/utils/request-context.util';
import systemGlobalConfigRepository from '../../../schemas/core/repositories/system-global-config.repository';
import systemGlobalConfigDtoModule from '../dtos/system-global-config.dto';
const { SystemGlobalConfigDTO } = systemGlobalConfigDtoModule;
import notificationCreationService from '../../../schemas/notification/services/notification-creation.service';

const NOTIF_SYSTEM_CONFIG_UPDATED = 'SYSTEM_CONFIG_UPDATED_INTERNAL';

class SystemGlobalConfigService {
  notificationCreationService: typeof notificationCreationService;
  systemGlobalConfigRepository: typeof systemGlobalConfigRepository;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new SystemGlobalConfigService({ notificationCreationService: fake })
   * @param {object} [deps]
   */
  constructor(deps: SystemGlobalConfigService.Deps = {}) {
    this.notificationCreationService = deps.notificationCreationService ?? notificationCreationService;
    this.systemGlobalConfigRepository = deps.systemGlobalConfigRepository ?? systemGlobalConfigRepository;
  }

  async getConfig(adminUserId: string) {
    const config = await this.systemGlobalConfigRepository.findActive();
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

  async updateConfig(data: SystemGlobalConfigService.UpdateInput, adminUserId: string, _auditCtx?: AdminAuditContext) {
    let config = await this.systemGlobalConfigRepository.findActive();

    if (!config) {
      logger.warn('SystemGlobalConfigService.update — no existe config activa, creando con defaults');
      config = await this.systemGlobalConfigRepository.createActive(requestContext.originFromContext());
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
      this.notificationCreationService
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

function _buildUpdatePayload(data: SystemGlobalConfigService.UpdateInput, current: defineSystemGlobalConfig.Instance) {
  const payload: Partial<defineSystemGlobalConfig.Attributes> = { config_version: current.config_version + 1 };

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
    payload.integration_resilience = _mergeResilience(current.integration_resilience as StoredResilience | null, data.integrationResilience);
  }

  return payload;
}

// integration_resilience se persiste en snake_case (con circuit_breaker anidado). Merge parcial:
// convierte los camelCase entrantes a snake_case y conserva lo no enviado (incluye el sub-objeto
// circuit_breaker campo a campo). Mismo criterio de edición que integraciones.
/** integration_resilience tal como se guarda (JSONB, snake_case). */
interface StoredResilience {
  timeout_ms?: number;
  manual_review_timeout_ms?: number;
  max_retries?: number;
  circuit_breaker?: { failure_threshold?: number; recovery_time_ms?: number; failures_ttl_s?: number };
}

function _mergeResilience(current: StoredResilience | null | undefined, incoming: SystemGlobalConfigService.ResilienceInput): StoredResilience {
  const base = current ?? {};
  const merged: StoredResilience = { ...base };

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
    const cb: NonNullable<StoredResilience['circuit_breaker']> = { ...baseCb };
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

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace SystemGlobalConfigService {
  /** integration_resilience tal como lo manda el panel (camelCase, todo opcional: merge parcial). */
  export interface ResilienceInput {
    timeoutMs?: number;
    manualReviewTimeoutMs?: number;
    maxRetries?: number;
    circuitBreaker?: { failureThreshold?: number; recoveryTimeMs?: number; failuresTtlS?: number };
  }

  export interface UpdateInput {
    currency?: string;
    auditRetentionHotYears?: number;
    auditRetentionColdYears?: number;
    auditHotPurgeEnabled?: boolean;
    integrationResilience?: ResilienceInput;
  }

  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    notificationCreationService?: typeof notificationCreationService;
    systemGlobalConfigRepository?: typeof systemGlobalConfigRepository;
  }
}

export default Object.assign(new SystemGlobalConfigService(), { SystemGlobalConfigService });
