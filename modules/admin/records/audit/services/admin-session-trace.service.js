// Fase 5 — API admin de sesiones (el consumidor de la trazabilidad).
// Superficie forense: dada una sesión, reconstruye qué se hizo en ella y con qué filas de dominio.
//
// Encuadre (§8.2 del PLAN-TRAZABILIDAD-SESION): la fuente del timeline es audit_logs (session_id +
// entity_table/entity_id), NO un fan-out a 50 tablas. La columna origin_session_id es red de seguridad
// (índice inverso / cobertura / durabilidad), no la fuente. La hidratación es perezosa y por lote:
// un findAll por tabla involucrada, agrupando los ids, reusando los DTOs admin que ya existen.

const { Op } = require('sequelize');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logAudit } = require('../../../../../shared/utils/logger.util');
const PaginationHelper = require('../../../../../shared/utils/pagination.util');
const { UserTrustedDevice, User, Person } = require('../../../../../shared/models');

const auditLogRepository = require('../../../../schemas/records/audit/repositories/audit-log.repository');
const userSessionRepository = require('../../../../schemas/kyc/iam/repositories/user-session.repository');
const userConsentRepository = require('../../../../schemas/records/legal/repositories/user-consent.repository');
// eslint-disable-next-line max-len
const notificationPreferenceRepo = require('../../../../schemas/kyc/person/repositories/user-notification-preference.repository');
const trustedDeviceRepo = require('../../../../schemas/kyc/iam/repositories/auth-trusted-device.repository');

const {
  UserConsentComponent,
  NotificationPreferenceComponent,
  TrustedDeviceComponent
} = require('../../../../../shared/dtos/audit/components-audit.dto');
const { SessionTraceListDTO, SessionTimelineDTO, SessionEntitiesDTO } = require('../dtos/admin-session-trace.dto');

// ============================================================
// REGISTRY — mapa entity_table → { repository, pk, entityType, dto } declarado en UN solo lugar (§8.4).
// Extensible: cada dominio que quieras hidratar en la trazabilidad suma su tabla aquí; el resto del
// feature no cambia. Las tablas no registradas caen en `skipped` y sus eventos llevan hasDetail=false.
// PII: estos DTOs enmascaran por defecto y esta vista NO es self-view — no se usa unmask. Al sumar una
// tabla con datos sensibles (dirección, teléfono, token), enmascará/omití esos campos en su component.
// ============================================================
const ENTITY_REGISTRY = {
  user_consents: {
    repository: userConsentRepository,
    pk: 'user_consent_id',
    entityType: 'UserConsent',
    dto: r => UserConsentComponent.build(r)
  },
  user_notification_preferences: {
    repository: notificationPreferenceRepo,
    pk: 'user_notification_preference_id',
    entityType: 'UserNotificationPreference',
    dto: r => NotificationPreferenceComponent.build(r)
  },
  user_trusted_devices: {
    repository: trustedDeviceRepo,
    pk: 'user_trusted_device_id',
    entityType: 'UserTrustedDevice',
    dto: r => TrustedDeviceComponent.build(r)
  }
};

function _isHydratable(entityTable, entityId) {
  return Boolean(entityTable) && Boolean(entityId) && Boolean(ENTITY_REGISTRY[entityTable]);
}

// Include para cabecera de sesión (dispositivo + usuario). sessionUser: alias que consume UserSessionComponent.
function _sessionInclude() {
  return [
    {
      model: UserTrustedDevice,
      as: 'device',
      required: false,
      attributes: ['user_trusted_device_id', 'device_name', 'device_type', 'browser', 'os', 'status']
    },
    {
      model: User,
      as: 'sessionUser',
      required: false,
      attributes: ['user_id', 'username'],
      include: [{ model: Person, as: 'person', attributes: ['first_name', 'last_name'] }]
    }
  ];
}

function _timelineExecutorInclude() {
  return [
    {
      model: User,
      as: 'executor',
      required: false,
      attributes: ['user_id', 'username'],
      include: [{ model: Person, as: 'person', attributes: ['first_name', 'last_name'] }]
    }
  ];
}

class AdminSessionTraceService {
  // GET /records/audit/sessions — listado paginado de sesiones con conteo de acciones por sesión.
  async listSessions(query, adminUserId) {
    const pagination = PaginationHelper.getPaginationParams(query);
    const where = userSessionRepository.buildWhere(query);

    const { rows, count } = await userSessionRepository.findPaginated(where, pagination, _sessionInclude());

    // Conteo de acciones por sesión, solo para las sesiones de esta página (un query agrupado).
    const sessionIds = rows.map(s => s.user_session_id);
    const counts = await auditLogRepository.countBySessionIds(sessionIds);
    const countMap = counts.reduce((acc, row) => {
      acc[row.session_id] = Number(row.count);
      return acc;
    }, {});

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
  async getSessionTimeline(sessionId, query, adminUserId) {
    const session = await userSessionRepository.findById(sessionId, { include: _sessionInclude() });
    if (!session) {
      throw AppError.notFound('Sesión no encontrada');
    }

    const pagination = PaginationHelper.getPaginationParams(query);

    const { rows, count } = await auditLogRepository.findPaginatedWithExecutor(
      { session_id: sessionId },
      { limit: pagination.limit, offset: pagination.offset, sortBy: 'created_at', order: 'ASC' },
      _timelineExecutorInclude()
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
      log => _isHydratable(log.entity_table, log.entity_id)
    );
  }

  // GET /records/audit/sessions/:sessionId/entities — hidratación por lote de las filas de dominio
  // referenciadas por el timeline. Un findAll por tabla involucrada; ids derivados de audit_logs
  // (nunca de input del usuario). ?entityTable= acota a una sola tabla (caso "expandir una fila").
  async getSessionEntities(sessionId, query, adminUserId) {
    const exists = await userSessionRepository.findById(sessionId, { attributes: ['user_session_id'] });
    if (!exists) {
      throw AppError.notFound('Sesión no encontrada');
    }

    let refs = await auditLogRepository.findEntityRefsBySession(sessionId);
    if (query.entityTable) {
      refs = refs.filter(r => r.entity_table === query.entityTable);
    }

    // Agrupar ids únicos por tabla.
    const idsByTable = {};
    for (const ref of refs) {
      (idsByTable[ref.entity_table] ??= new Set()).add(ref.entity_id);
    }

    const entities = [];
    const skipped = [];

    for (const [entityTable, idSet] of Object.entries(idsByTable)) {
      const ids = [...idSet];
      const entry = ENTITY_REGISTRY[entityTable];
      if (!entry) {
        skipped.push({ entityTable, count: ids.length });
        continue;
      }
      const domainRows = await entry.repository.findAll({ [entry.pk]: { [Op.in]: ids } });
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

module.exports = new AdminSessionTraceService();
