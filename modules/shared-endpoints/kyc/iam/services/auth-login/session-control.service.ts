// modules/shared-endpoints/kyc/iam/services/auth-login/session-control.service.ts
//
// Control de sesiones: cierre selectivo, cierre de sesiones previas del mismo
// dispositivo y límite de sesiones simultáneas. Extraído de AuthLoginService (SOLID: S).

import userSessionRepository from '../../../../../schemas/kyc/iam/repositories/user-session.repository';
import RefreshTokenStore from '../../../../../../shared/utils/refresh-token-store.util';
import TokenBlacklistUtil from '../../../../../../shared/utils/token-blacklist.util';
import AppError from '../../../../../../shared/utils/app-error.util';
import loggerUtilModule from '../../../../../../shared/utils/logger.util';
const { logger, logAudit } = loggerUtilModule;
import constantsModule from '../../../../../../shared/constants';
const { SECURITY } = constantsModule;

class SessionControlService {
  userSessionRepository: typeof userSessionRepository;

  /**
   * @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada
   *   AuthLoginService; por defecto se usan las implementaciones reales.
   */
  constructor(deps: SessionControlService.Deps = {}) {
    this.userSessionRepository = deps.userSessionRepository ?? userSessionRepository;
  }

  // ============================================================
  // SESIONES — CIERRE SELECTIVO
  // ============================================================

  // [RF-AUTH-02] | CA-02 | Cierre de sesión individual por ID (usado por RF-AUTH-03)
  // [RF-AUTH-03] | CA-02 | Cierra sesión individual que no sea la actual;
  // invalida en BD + revoca JTI en RefreshTokenStore + blacklist en Redis
  async closeSessionById(userId: string, sessionId: string, currentSessionId: string | null) {
    if (sessionId === currentSessionId) {
      throw AppError.badRequest('Para cerrar la sesión actual usa el endpoint de logout');
    }

    const session = await this.userSessionRepository.findById(sessionId);
    if (!session || session.user_id !== userId) {
      throw AppError.notFound('Sesión no encontrada');
    }
    if (session.status !== 'active') {
      throw AppError.badRequest('La sesión ya está cerrada');
    }

    await this.userSessionRepository.closeSession(sessionId, 'closed_by_user');

    RefreshTokenStore.revoke(session.jti).catch(err =>
      logger.warn('Error revocando JTI al cerrar sesión por usuario', {
        error: err.message,
        sessionId,
        jti: session.jti
      })
    );

    // Invalida el access token activo de esa sesión de inmediato (no esperar al TTL)
    TokenBlacklistUtil.blacklistSession(sessionId).catch(err =>
      logger.warn('Error invalidando sesión en blacklist al cerrar por usuario', {
        error: err.message,
        sessionId
      })
    );

    logAudit(
      'SESSION_CLOSED_BY_USER',
      userId,
      {},
      { entityId: sessionId, entityType: 'UserSession', entityTable: 'user_sessions' }
    );

    return { sessionId, status: 'closed' };
  }

  // [RF-AUTH-02] | CA-02 | Cierra todas las sesiones salvo la actual
  // [RF-AUTH-03] | CA-02 | Cierra todas las sesiones salvo la actual;
  // revoca cada JTI y blacklista. Devuelve closedCount
  async closeOtherSessions(userId: string, currentSessionId: string | null) {
    const others = await this.userSessionRepository.findActiveByUserExcept(userId, currentSessionId);

    if (others.length === 0) {
      return { closedCount: 0 };
    }

    await this.userSessionRepository.closeAllByUserExcept(userId, currentSessionId, 'logout_others');

    for (const session of others) {
      RefreshTokenStore.revoke(session.jti).catch(err =>
        logger.warn('Error revocando JTI en logout-others', {
          error: err.message,
          sessionId: session.user_session_id,
          jti: session.jti
        })
      );

      // Invalida el access token activo de cada sesión cerrada de inmediato
      TokenBlacklistUtil.blacklistSession(session.user_session_id).catch(err =>
        logger.warn('Error invalidando sesión en blacklist en logout-others', {
          error: err.message,
          sessionId: session.user_session_id
        })
      );
    }

    logAudit(
      'LOGOUT_OTHERS',
      userId,
      { closedCount: others.length },
      { entityId: userId, entityType: 'User', entityTable: 'users' }
    );

    return { closedCount: others.length };
  }

  // ============================================================
  // PRIVATE
  // ============================================================

  /**
   * Una sesión por dispositivo: al iniciar sesión, cierra e invalida cualquier
   * sesión activa previa del MISMO dispositivo (mismo device_id). El token del
   * login anterior en ese dispositivo deja de servir de inmediato. Las sesiones
   * en OTROS dispositivos no se tocan.
   *
   * @private
   */
  async closePreviousDeviceSessions(userId: string, deviceId: string) {
    if (!deviceId) {
      return;
    }

    const previous = await this.userSessionRepository.findActiveByUserAndDevice(userId, deviceId);
    if (previous.length === 0) {
      return;
    }

    for (const session of previous) {
      this.userSessionRepository.closeSession(session.user_session_id, 'reauth_same_device').catch(err =>
        logger.warn('Error cerrando sesión previa del mismo dispositivo', {
          error: err.message,
          sessionId: session.user_session_id
        })
      );

      RefreshTokenStore.revoke(session.jti).catch(err =>
        logger.warn('Error revocando JTI de sesión previa del mismo dispositivo', {
          error: err.message,
          sessionId: session.user_session_id,
          jti: session.jti
        })
      );

      TokenBlacklistUtil.blacklistSession(session.user_session_id).catch(err =>
        logger.warn('Error invalidando sesión previa del mismo dispositivo', {
          error: err.message,
          sessionId: session.user_session_id
        })
      );
    }

    logAudit(
      'PREVIOUS_DEVICE_SESSIONS_CLOSED',
      userId,
      {
        closedCount: previous.length
      },
      { entityId: deviceId, entityType: 'UserTrustedDevice', entityTable: 'user_trusted_devices' }
    );
  }

  /** @private */
  // [RF-AUTH-03] | CA-04 | Aplica límite de 5 sesiones simultáneas; si se supera,
  // busca la más antigua, la cierra en BD, revoca en Redis y registra auditoría
  async enforceSessionLimit(userId: string) {
    const activeCount = await this.userSessionRepository.countActive(userId);
    if (activeCount < SECURITY.MAX_ACTIVE_SESSIONS) {
      return;
    }

    const oldest = await this.userSessionRepository.findOldestActive(userId);
    if (!oldest) {
      return;
    }

    await this.userSessionRepository.closeSession(oldest.user_session_id, 'session_limit');

    RefreshTokenStore.revoke(oldest.jti).catch(err =>
      logger.warn('Error revocando JTI al aplicar límite de sesiones', {
        error: err.message,
        sessionId: oldest.user_session_id,
        jti: oldest.jti
      })
    );

    // Invalida el access token activo de la sesión más antigua de inmediato
    TokenBlacklistUtil.blacklistSession(oldest.user_session_id).catch(err =>
      logger.warn('Error invalidando sesión en blacklist al aplicar límite de sesiones', {
        error: err.message,
        sessionId: oldest.user_session_id
      })
    );

    logAudit(
      'SESSION_LIMIT_ENFORCED',
      userId,
      {
        activeCount
      },
      { entityId: oldest.user_session_id, entityType: 'UserSession', entityTable: 'user_sessions' }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace SessionControlService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    userSessionRepository?: typeof userSessionRepository;
  }
}

export default SessionControlService;
