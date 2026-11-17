import type SessionTraceDto from '../dtos/admin-session-trace.dto';
// Fase 5 — API admin de sesiones (el consumidor de la trazabilidad).
// Superficie forense: dada una sesión, reconstruye qué se hizo en ella y con qué filas de dominio.
//
// Encuadre (§8.2 del PLAN-TRAZABILIDAD-SESION): la fuente del timeline es audit_logs (session_id +
// entity_table/entity_id), NO un fan-out a 50 tablas. La columna origin_session_id es red de seguridad
// (índice inverso / cobertura / durabilidad), no la fuente. La hidratación es perezosa y por lote:
// un findAll por tabla involucrada, agrupando los ids, reusando los DTOs admin que ya existen.

import AppError from '../../../../../shared/utils/app-error.util';
import loggerUtilModule from '../../../../../shared/utils/logger.util';
const { logAudit } = loggerUtilModule;
import PaginationHelper from '../../../../../shared/utils/pagination.util';

import auditLogRepository from '../../../../schemas/records/audit/repositories/audit-log.repository';
import userSessionRepository from '../../../../schemas/kyc/iam/repositories/user-session.repository';
import userConsentRepository from '../../../../schemas/records/legal/repositories/user-consent.repository';
// eslint-disable-next-line max-len
import notificationPreferenceRepo from '../../../../schemas/kyc/person/repositories/user-notification-preference.repository';
import trustedDeviceRepo from '../../../../schemas/kyc/iam/repositories/auth-trusted-device.repository';

import componentsAuditDtoModule from '../../../../../shared/dtos/audit/components-audit.dto';
const {
  UserConsentComponent,
  NotificationPreferenceComponent,
  TrustedDeviceComponent
} = componentsAuditDtoModule;
import adminSessionTraceDtoModule from '../dtos/admin-session-trace.dto';
const { SessionTraceListDTO, SessionTimelineDTO, SessionEntitiesDTO } = adminSessionTraceDtoModule;

// ============================================================
// REGISTRY — mapa entity_table → { repository, pk, entityType, dto } declarado en UN solo lugar (§8.4).
// Extensible: cada dominio que quieras hidratar en la trazabilidad suma su tabla aquí; el resto del
// feature no cambia. Las tablas no registradas caen en `skipped` y sus eventos llevan hasDetail=false.
// PII: estos DTOs enmascaran por defecto y esta vista NO es self-view — no se usa unmask. Al sumar una
// tabla con datos sensibles (dirección, teléfono, token), enmascará/omití esos campos en su component.
// ============================================================
/** Entrada del registry: cómo traer las filas de una tabla y cómo serializarlas. */
interface RegistryEntry<R> {
  repository: { findByIds(ids: string[], field: string): Promise<R[]> };
  pk: string;
  entityType: string;
  dto: (row: R) => unknown;
}

// Cada entrada se valida con su propio tipo de fila (R) y se guarda borrado: el registry es heterogéneo.
function _entry<R>(entry: RegistryEntry<R>): RegistryEntry<unknown> {
  return entry as unknown as RegistryEntry<unknown>;
}

const ENTITY_REGISTRY: Record<string, RegistryEntry<unknown> | undefined> = {
  user_consents: _entry({
    repository: userConsentRepository,
    pk: 'userConsentId',
    entityType: 'UserConsent',
    dto: r => UserConsentComponent.build(r)
  }),
  user_notification_preferences: _entry({
    repository: notificationPreferenceRepo,
    pk: 'userNotificationPreferenceId',
    entityType: 'UserNotificationPreference',
    dto: r => NotificationPreferenceComponent.build(r)
  }),
  user_trusted_devices: _entry({
    repository: trustedDeviceRepo,
    pk: 'user_trusted_device_id',
    entityType: 'UserTrustedDevice',
    dto: r => TrustedDeviceComponent.build(r)
  })
};

function _isHydratable(entityTable: string | null, entityId: string | null) {
  return Boolean(entityTable && entityId && ENTITY_REGISTRY[entityTable]);
}

class AdminSessionTraceService {
  auditLogRepository: typeof auditLogRepository;
  userSessionRepository: typeof userSessionRepository;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new AdminSessionTraceService({ auditLogRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps: AdminSessionTraceService.Deps = {}) {
    this.auditLogRepository = deps.auditLogRepository ?? auditLogRepository;
    this.userSessionRepository = deps.userSessionRepository ?? userSessionRepository;
  }

  // GET /records/audit/sessions — listado paginado de sesiones con conteo de acciones por sesión.
  async listSessions(query: Record<string, unknown>, adminUserId: string) {
    const pagination = PaginationHelper.getPaginationParams(query);
    const where = this.userSessionRepository.buildWhere(query);

    const { rows, count } = await this.userSessionRepository.findPaginatedWithDeviceAndUser(where, pagination);

    // Conteo de acciones por sesión, solo para las sesiones de esta página (un query agrupado).
    const sessionIds = rows.map(s => s.user_session_id);
    const counts = await this.auditLogRepository.countBySessionIds(sessionIds);
    const countMap = new Map(counts.map(row => [row.sessionId, row.count]));

    const activeFilters = PaginationHelper.buildFilters(query, ['userId', 'sessionId', 'status', 'ip', 'dateFrom', 'dateTo']);

    logAudit(
      'SESSION_TRACE_LIST_VIEWED',
      adminUserId,
      { totalItems: count, filters: Object.keys(activeFilters) },
      { entityType: 'AuthSession', entityTable: 'user_sessions' }
    );

    return SessionTraceListDTO(rows, countMap, {
      totalItems: count,
      page: pagination.page,
      limit: pagination.limit,
      sortBy: pagination.sortBy,
      order: pagination.order,
      filters: Object.keys(activeFilters).length > 0 ? activeFilters : undefined
    });
  }

  // GET /records/audit/sessions/:sessionId — cabecera + timeline cronológico de audit_logs.
  async getSessionTimeline(sessionId: string, query: Record<string, unknown>, adminUserId: string) {
    const session = await this.userSessionRepository.findByIdWithDeviceAndUser(sessionId);
    if (!session) {
      throw AppError.notFound('Sesión no encontrada');
    }

    const pagination = PaginationHelper.getPaginationParams(query);

    const { rows, count } = await this.auditLogRepository.findPaginatedWithExecutor(
      { sessionId },
      { limit: pagination.limit, offset: pagination.offset, sortBy: 'created_at', order: 'ASC' }
    );

    logAudit(
      'SESSION_TRACE_VIEWED',
      adminUserId,
      { sessionId, totalItems: count },
      { entityId: sessionId, entityType: 'AuthSession', entityTable: 'user_sessions' }
    );

    return SessionTimelineDTO(
      session,
      count,
      rows,
      {
        totalItems: count,
        page: pagination.page,
        limit: pagination.limit,
        sortBy: 'createdAt',
        order: 'ASC'
      },
      log => _isHydratable(log.entityTable, log.entityId)
    );
  }

  // GET /records/audit/sessions/:sessionId/entities — hidratación por lote de las filas de dominio
  // referenciadas por el timeline. Un findAll por tabla involucrada; ids derivados de audit_logs
  // (nunca de input del usuario). ?entityTable= acota a una sola tabla (caso "expandir una fila").
  async getSessionEntities(sessionId: string, query: Record<string, unknown>, adminUserId: string) {
    const exists = await this.userSessionRepository.findById(sessionId, { attributes: ['user_session_id'] });
    if (!exists) {
      throw AppError.notFound('Sesión no encontrada');
    }

    let refs = await this.auditLogRepository.findEntityRefsBySession(sessionId);
    const entityTableFilter = PaginationHelper.stringParam(query, 'entityTable');
    if (entityTableFilter) {
      refs = refs.filter(r => r.entityTable === entityTableFilter);
    }

    // Agrupar ids únicos por tabla.
    const idsByTable: Record<string, Set<string>> = {};
    for (const ref of refs) {
      (idsByTable[ref.entityTable] ??= new Set()).add(ref.entityId);
    }

    const entities: SessionTraceDto.EntityGroup[] = [];
    const skipped: Array<{ entityTable: string; count: number }> = [];

    for (const [entityTable, idSet] of Object.entries(idsByTable)) {
      const ids = [...idSet];
      const entry = ENTITY_REGISTRY[entityTable];
      if (!entry) {
        skipped.push({ entityTable, count: ids.length });
        continue;
      }
      const domainRows = await entry.repository.findByIds(ids, entry.pk);
      entities.push({
        entityTable,
        entityType: entry.entityType,
        count: domainRows.length,
        items: domainRows.map(entry.dto)
      });
    }

    logAudit(
      'SESSION_TRACE_ENTITIES_VIEWED',
      adminUserId,
      { sessionId, tables: entities.map(e => e.entityTable), skipped: skipped.map(s => s.entityTable) },
      { entityId: sessionId, entityType: 'AuthSession', entityTable: 'user_sessions' }
    );

    return SessionEntitiesDTO(sessionId, entities, skipped);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace AdminSessionTraceService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    auditLogRepository?: typeof auditLogRepository;
    userSessionRepository?: typeof userSessionRepository;
  }
}

export default Object.assign(new AdminSessionTraceService(), { AdminSessionTraceService });
