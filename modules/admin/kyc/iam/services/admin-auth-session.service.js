// === RF-AUTH-02, RF-AUTH-03: Login, Gestión de Sesión Segura y Recuperación de Contraseña ===
// === RF-AUTH-03 (admin): Gestión de Dispositivos Autenticados y Control de Sesiones ===

const userSessionRepository = require('../../../../schemas/kyc/iam/repositories/user-session.repository');
const auditLogRepository = require('../../../../schemas/records/audit/repositories/audit-log.repository');
const RefreshTokenStore = require('../../../../../shared/utils/refresh-token-store.util');
const TokenBlacklistUtil = require('../../../../../shared/utils/token-blacklist.util');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../shared/utils/logger.util');
const { notifications } = require('../../../../../shared/constants');
const NotificationCreationService = require('../../../../schemas/notification/services/notification-creation.service');
const PaginationHelper = require('../../../../../shared/utils/pagination.util');
const { UserTrustedDevice, User, Person, UserSession } = require('../../../../../shared/models');
const { SessionListDTO, AuthAttemptListDTO } = require('../dtos/admin-auth-session.dto');

const AUTH_CATEGORY = 'Autenticación';
const DEFAULT_DATE_FROM = new Date('2000-01-01');

// scope=login → solo intentos de inicio de sesión (no toda la categoría 'Autenticación')
const LOGIN_ACTIONS = [
  'LOGIN_SUCCESS', // inicio de sesión exitoso
  'LOGIN_FAILED', // intento fallido
  'LOGIN_BLOCKED_DEVICE', // intento desde dispositivo bloqueado
  'LOGIN_BLOCKED_POLICY_UPDATE', // inicio bloqueado por política pendiente
  'ACCOUNT_BLOCKED', // cuenta bloqueada por múltiples fallos
  'REFRESH_TOKEN_REUSE_ATTACK' // reuso de refresh token detectado
];

const ATTEMPTS_INCLUDE = [
  {
    model: User,
    as: 'executor',
    required: false,
    attributes: ['user_id', 'username'],
    include: [{ model: Person, as: 'person', attributes: ['first_name', 'last_name'] }]
  }
];

class AdminAuthSessionService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new AdminAuthSessionService({ userSessionRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.userSessionRepository = deps.userSessionRepository ?? userSessionRepository;
    this.auditLogRepository = deps.auditLogRepository ?? auditLogRepository;
    this.NotificationCreationService = deps.NotificationCreationService ?? NotificationCreationService;
  }

  // [RF-AUTH-02] | CA-04 | Superficie de consumo para RF-AUTH-03: lista sesiones con JOIN a dispositivos
  // [RF-AUTH-03] | CA-01 | Vista admin de sesiones activas (equivalente a
  // /auth/devices pero con vista por sesión cruda y scope de todos los usuarios)
  async listSessions(query, adminUserId) {
    const pagination = PaginationHelper.getPaginationParams(query);
    const where = this.userSessionRepository.buildWhere(query);

    const include = [
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

    const { rows, count } = await this.userSessionRepository.findPaginated(where, pagination, include);

    logAudit(
      'AUTH_SESSION_LIST_VIEWED',
      adminUserId,
      { totalItems: count },
      { entityType: 'AuthSession', entityTable: 'user_sessions' }
    );

    const filters = {};
    if (query.sessionId) {
      filters.sessionId = query.sessionId;
    }

    return SessionListDTO(rows, {
      totalItems: count,
      page: pagination.page,
      limit: pagination.limit,
      sortBy: pagination.sortBy,
      order: pagination.order,
      filters
    });
  }

  // [RF-AUTH-02] | CA-04 | Superficie de consumo para RF-AUTH-03: lista sesiones con JOIN a dispositivos
  // [RF-AUTH-03] | CA-01 | Vista admin de sesiones activas (equivalente a
  // /auth/devices pero con vista por sesión cruda y scope de todos los usuarios)
  async getSessionsByUser(userId, query, adminUserId) {
    const pagination = PaginationHelper.getPaginationParams(query);
    const where = this.userSessionRepository.buildWhere({ userId, status: query.status });

    const include = [
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

    const { rows, count } = await this.userSessionRepository.findPaginated(where, pagination, include);

    logAudit(
      'AUTH_SESSION_BY_USER_VIEWED',
      adminUserId,
      { targetUserId: userId },
      { entityId: userId, entityType: 'InternalUser' }
    );

    return SessionListDTO(rows, {
      totalItems: count,
      page: pagination.page,
      limit: pagination.limit,
      sortBy: pagination.sortBy,
      order: pagination.order,
      filters: {}
    });
  }

  // [RF-AUTH-02] | CA-02, CA-04 | Revocación administrativa de sesión individual
  // [RF-AUTH-03] | CA-02 | Revocación administrativa de sesión con notificación
  // al usuario (supera lo especificado en el requerimiento)
  async revokeSession(sessionId, adminUserId) {
    const session = await this.userSessionRepository.findById(sessionId);
    if (!session) {
      throw AppError.notFound('Sesión no encontrada');
    }
    if (session.status !== UserSession.STATUS.ACTIVE) {
      throw AppError.badRequest('La sesión ya está cerrada');
    }

    await this.userSessionRepository.closeSession(sessionId, 'revoked_by_admin');

    RefreshTokenStore.revoke(session.jti).catch(err =>
      logger.warn('Error revocando JTI en Redis al revocar sesión por admin', {
        error: err.message,
        sessionId,
        jti: session.jti
      })
    );

    // Invalidación quirúrgica: solo el access token de ESTA sesión (umbral por sessionId).
    // No usar invalidateUserSessions (umbral global del usuario) — mataría las demás sesiones.
    TokenBlacklistUtil.blacklistSession(sessionId).catch(err =>
      logger.warn('Error invalidando la sesión en Redis al revocar por admin', {
        error: err.message,
        sessionId,
        userId: session.user_id
      })
    );

    logAudit(
      'AUTH_SESSION_REVOKED',
      adminUserId,
      {
        targetUserId: session.user_id,
        jti: session.jti,
        before: { status: 'active' },
        after: { status: 'revoked_by_admin' }
      },
      { entityId: sessionId, entityType: 'AuthSession' }
    );

    setImmediate(() => {
      this.NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'AUTH_SESSION_REVOKED_INTERNAL',
        userId: adminUserId,
        relatedEntity: sessionId,
        metadata: { sessionId, targetUserId: session.user_id, logoUrl: notifications.ses.logoUrl }
      }).catch(err => logger.warn('Error enviando AUTH_SESSION_REVOKED_INTERNAL', { error: err.message }));
    });

    setImmediate(() => {
      this.NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'AUTH_SESSION_REVOKED_CLIENT',
        userId: session.user_id,
        relatedEntity: sessionId,
        metadata: { logoUrl: notifications.ses.logoUrl }
      }).catch(err => logger.warn('Error enviando AUTH_SESSION_REVOKED_CLIENT', { error: err.message }));
    });

    return { sessionId, status: 'closed', closeReason: 'revoked_by_admin' };
  }

  // Traduce el query HTTP a criterios de negocio (sin Sequelize): scope, usuario, outcome y rango de fechas.
  // scope=login → solo LOGIN_ACTIONS; scope=all (default) → toda la categoría 'Autenticación'.
  // El repositorio es quien convierte estos criterios en un WHERE.
  _buildAttemptsCriteria(query, forcedUserId = null) {
    const from = query.dateFrom ? new Date(query.dateFrom) : DEFAULT_DATE_FROM;
    const to = query.dateTo ? new Date(query.dateTo) : new Date();
    const isLoginScope = query.scope === 'login';

    return {
      from,
      to,
      actions: isLoginScope ? LOGIN_ACTIONS : undefined,
      category: isLoginScope ? undefined : AUTH_CATEGORY,
      userId: forcedUserId || query.userId || undefined,
      outcome: query.outcome || undefined
    };
  }

  async listAttempts(query, adminUserId) {
    const pagination = PaginationHelper.getPaginationParams(query);
    const criteria = this._buildAttemptsCriteria(query);

    const { rows, count } = await this.auditLogRepository.findAuthAttemptsPaginated(criteria, pagination, ATTEMPTS_INCLUDE);

    const scope = query.scope || 'all';
    logAudit(
      'AUTH_ATTEMPTS_LIST_VIEWED',
      adminUserId,
      { totalItems: count, scope },
      { entityType: 'AuditLog', entityTable: 'audit_logs' }
    );

    return AuthAttemptListDTO(rows, {
      totalItems: count,
      page: pagination.page,
      limit: pagination.limit,
      sortBy: pagination.sortBy,
      order: pagination.order,
      filters: { scope }
    });
  }

  async getAttemptsByUser(userId, query, adminUserId) {
    const pagination = PaginationHelper.getPaginationParams(query);
    const criteria = this._buildAttemptsCriteria(query, userId);

    const { rows, count } = await this.auditLogRepository.findAuthAttemptsPaginated(criteria, pagination, ATTEMPTS_INCLUDE);

    const scope = query.scope || 'all';
    logAudit(
      'AUTH_ATTEMPTS_BY_USER_VIEWED',
      adminUserId,
      { targetUserId: userId, scope },
      { entityId: userId, entityType: 'InternalUser' }
    );

    return AuthAttemptListDTO(rows, {
      totalItems: count,
      page: pagination.page,
      limit: pagination.limit,
      sortBy: pagination.sortBy,
      order: pagination.order,
      filters: { scope }
    });
  }
}

module.exports = new AdminAuthSessionService();
module.exports.AdminAuthSessionService = AdminAuthSessionService;
