// modules/shared-endpoints/kyc/iam/services/auth-login/session-issuer.service.js
//
// Emisión de una sesión autenticada: par de tokens RS256 propios + JTI en Redis + fila en
// user_sessions. Lo usan el login por contraseña, el biométrico y el login automático
// post-registro (antes el bloque estaba copiado en los tres). Extraído por SOLID: S.

const crypto = require('node:crypto');
const userSessionRepository = require('../../../../../schemas/kyc/iam/repositories/user-session.repository');
const JwtUtil = require('../../../../../../shared/utils/jwt.util');
const RefreshTokenStore = require('../../../../../../shared/utils/refresh-token-store.util');
const { logger } = require('../../../../../../shared/utils/logger.util');
const { jwt: jwtConfig } = require('../../../../../../shared/constants');

class SessionIssuerService {
  /**
   * @param {object} [deps] Dependencias inyectables (SOLID: D).
   */
  constructor(deps = {}) {
    this.userSessionRepository = deps.userSessionRepository ?? userSessionRepository;
    this.jwt = deps.jwt ?? JwtUtil;
    this.refreshTokenStore = deps.refreshTokenStore ?? RefreshTokenStore;
  }

  /**
   * @param {Object} user - usuario con las asociaciones que el access token necesita (rol, persona)
   * @param {{ deviceId?: string|null, ip?: string|null, userAgent?: string|null, source: string }} options
   *   source: etiqueta para los logs (p. ej. 'login', 'login biométrico', 'registro')
   * @returns {Promise<{ sessionId: string, tokens: { accessToken, refreshToken, expiresIn } }>}
   */
  async issue(user, { deviceId = null, ip = null, userAgent = null, source }) {
    const userId = user.user_id;
    const sessionId = crypto.randomUUID();
    const jti = crypto.randomUUID();
    const accessToken = await this.jwt.generateAccessToken(user, sessionId);
    const refreshToken = await this.jwt.generateRefreshToken(userId, jti, sessionId);

    // JTI awaited: si falla, el refresh no servirá, pero no bloqueamos la autenticación
    const jtiSaved = await this.refreshTokenStore.save(jti, userId);
    if (!jtiSaved) {
      logger.warn(`No se pudo guardar JTI de refresh token en ${source}`, { userId });
    }

    // [RF-AUTH-02] | CA-04 | Sesión activa con IP, user-agent, started_at y last_access_at (fire-and-forget)
    this.userSessionRepository
      .create({
        user_session_id: sessionId,
        user_id: userId,
        device_id: deviceId || null,
        jti,
        ip_address: ip || null,
        user_agent: userAgent || null,
        started_at: new Date(),
        last_access_at: new Date()
      })
      .catch(err => logger.warn(`Error creando registro de sesión en BD (${source})`, { error: err.message, userId }));

    return { sessionId, tokens: { accessToken, refreshToken, expiresIn: jwtConfig.accessTokenExpiry } };
  }
}

module.exports = SessionIssuerService;
