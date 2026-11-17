// === RF-AUTH-02, RF-AUTH-03: Login, Gestión de Sesión Segura y Recuperación de Contraseña ===
// === RF-AUTH-03 (admin): Gestión de Dispositivos Autenticados y Control de Sesiones ===

import userSessionRepository from '../../../../schemas/kyc/iam/repositories/user-session.repository';
import auditLogRepository from '../../../../schemas/records/audit/repositories/audit-log.repository';
import RefreshTokenStore from '../../../../../shared/utils/refresh-token-store.util';
import TokenBlacklistUtil from '../../../../../shared/utils/token-blacklist.util';
import AppError from '../../../../../shared/utils/app-error.util';
import loggerUtilModule from '../../../../../shared/utils/logger.util';
const { logger, logAudit } = loggerUtilModule;
import constantsModule from '../../../../../shared/constants';
const { notifications } = constantsModule;
import NotificationCreationService from '../../../../schemas/notification/services/notification-creation.service';
import PaginationHelper from '../../../../../shared/utils/pagination.util';
import domainEnumsModule from '../../../../../shared/constants/domain-enums';
const { USER_SESSION_STATUS } = domainEnumsModule;
import adminAuthSessionDtoModule from '../dtos/admin-auth-session.dto';
const { SessionListDTO, AuthAttemptListDTO } = adminAuthSessionDtoModule;

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

class AdminAuthSessionService {
  userSessionRepository: typeof userSessionRepository;
  auditLogRepository: typeof auditLogRepository;
  NotificationCreationService: typeof NotificationCreationService;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new AdminAuthSessionService({ userSessionRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps: AdminAuthSessionService.Deps = {}) {
    this.userSessionRepository = deps.userSessionRepository ?? userSessionRepository;
    this.auditLogRepository = deps.auditLogRepository ?? auditLogRepository;
    this.NotificationCreationService = deps.NotificationCreationService ?? NotificationCreationService;
  }

  // [RF-AUTH-02] | CA-04 | Superficie de consumo para RF-AUTH-03: lista sesiones con JOIN a dispositivos
  // [RF-AUTH-03] | CA-01 | Vista admin de sesiones activas (equivalente a
  // /auth/devices pero con vista por sesión cruda y scope de todos los usuarios)
  async listSessions(query: Record<string, unknown>, adminUserId: string) {
    const pagination = PaginationHelper.getPaginationParams(query);
    const where = this.userSessionRepository.buildWhere(query);

    const { rows, count } = await this.userSessionRepository.findPaginatedWithDeviceAndUser(where, pagination);

    logAudit(
      'AUTH_SESSION_LIST_VIEWED',
      adminUserId,
      { totalItems: count },
      { entityType: 'AuthSession', entityTable: 'user_sessions' }
    );

    const filters: Record<string, unknown> = {};
    const sessionIdParam = PaginationHelper.stringParam(query, 'sessionId');
    if (sessionIdParam) {
      filters.sessionId = sessionIdParam;
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
  async getSessionsByUser(userId: string, query: Record<string, unknown>, adminUserId: string) {
    const pagination = PaginationHelper.getPaginationParams(query);
    const statusParam = PaginationHelper.stringParam(query, 'status');
    const where = this.userSessionRepository.buildWhere({
      userId,
      status: statusParam === 'active' || statusParam === 'closed' ? statusParam : undefined
    });

    const { rows, count } = await this.userSessionRepository.findPaginatedWithDeviceAndUser(where, pagination);

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
  async revokeSession(sessionId: string, adminUserId: string) {
    const session = await this.userSessionRepository.findById(sessionId);
    if (!session) {
      throw AppError.notFound('Sesión no encontrada');
    }
    if (session.status !== USER_SESSION_STATUS.ACTIVE) {
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
        userId: session.userId
      })
    );

    logAudit(
      'AUTH_SESSION_REVOKED',
      adminUserId,
      {
        targetUserId: session.userId,
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
        relatedEntity: { type: 'UserSession', id: sessionId },
        metadata: { sessionId, targetUserId: session.userId, logoUrl: notifications.ses.logoUrl }
      }).catch(err => logger.warn('Error enviando AUTH_SESSION_REVOKED_INTERNAL', { error: err.message }));
    });

    setImmediate(() => {
      this.NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'AUTH_SESSION_REVOKED_CLIENT',
        userId: session.userId,
        relatedEntity: { type: 'UserSession', id: sessionId },
        metadata: { logoUrl: notifications.ses.logoUrl }
      }).catch(err => logger.warn('Error enviando AUTH_SESSION_REVOKED_CLIENT', { error: err.message }));
    });

    return { sessionId, status: 'closed', closeReason: 'revoked_by_admin' };
  }

  // Traduce el query HTTP a criterios de negocio (sin Sequelize): scope, usuario, outcome y rango de fechas.
  // scope=login → solo LOGIN_ACTIONS; scope=all (default) → toda la categoría 'Autenticación'.
  // El repositorio es quien convierte estos criterios en un WHERE.
  _buildAttemptsCriteria(query: Record<string, unknown>, forcedUserId: string | null = null) {
    const dateFrom = PaginationHelper.stringParam(query, 'dateFrom');
    const dateTo = PaginationHelper.stringParam(query, 'dateTo');
    const from = dateFrom ? new Date(dateFrom) : DEFAULT_DATE_FROM;
    const to = dateTo ? new Date(dateTo) : new Date();
    const isLoginScope = query.scope === 'login';

    return {
      from,
      to,
      actions: isLoginScope ? LOGIN_ACTIONS : undefined,
      category: isLoginScope ? undefined : AUTH_CATEGORY,
      userId: forcedUserId || PaginationHelper.stringParam(query, 'userId') || undefined,
      outcome: PaginationHelper.stringParam(query, 'outcome') || undefined
    };
  }

  async listAttempts(query: Record<string, unknown>, adminUserId: string) {
    const pagination = PaginationHelper.getPaginationParams(query);
    const criteria = this._buildAttemptsCriteria(query);

    const { rows, count } = await this.auditLogRepository.findAuthAttemptsPaginated(criteria, pagination);

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

  async getAttemptsByUser(userId: string, query: Record<string, unknown>, adminUserId: string) {
    const pagination = PaginationHelper.getPaginationParams(query);
    const criteria = this._buildAttemptsCriteria(query, userId);

    const { rows, count } = await this.auditLogRepository.findAuthAttemptsPaginated(criteria, pagination);

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

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace AdminAuthSessionService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    userSessionRepository?: typeof userSessionRepository;
    auditLogRepository?: typeof auditLogRepository;
    NotificationCreationService?: typeof NotificationCreationService;
  }
}

export default Object.assign(new AdminAuthSessionService(), { AdminAuthSessionService });
