const crypto = require('node:crypto');
const userRepository = require('../../../../schemas/kyc/iam/repositories/user.repository');
const userLoginAttemptRepository = require('../../../../schemas/records/audit/repositories/user-login-attempt.repository');
const verificationCodeRepository = require('../../../../schemas/notification/repositories/verification-code.repository');
const userSessionRepository = require('../../../../schemas/kyc/iam/repositories/user-session.repository');
const trustedDeviceRepository = require('../../../../schemas/kyc/iam/repositories/auth-trusted-device.repository');
const privacyPolicyRepository = require('../../../../schemas/records/legal/repositories/privacy-policy.repository');
const consentRecorder = require('../../../../schemas/records/legal/services/consent-recorder.service');
const JwtUtil = require('../../../../../shared/utils/jwt.util');
const TotpUtil = require('../../../../../shared/utils/totp.util');
const EncryptionUtil = require('../../../../../shared/utils/encryption.util');
const RefreshTokenStore = require('../../../../../shared/utils/refresh-token-store.util');
const DeviceFingerprintUtil = require('../../../../../shared/utils/device-fingerprint.util');
const DeviceBlocklistUtil = require('../../../../../shared/utils/device-blocklist.util');
const TokenBlacklistUtil = require('../../../../../shared/utils/token-blacklist.util');
const redisClient = require('../../../../../shared/utils/redis.util');
const NotificationUtil = require('../../../../schemas/notification/services/notification-creation.service');
const SmsService = require('../../../../schemas/notification/services/sms.service');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../shared/utils/logger.util');
const LoginRateLimiter = require('../../../../../shared/utils/login-rate-limiter.util');
const {
  LOGIN_RATE_LIMIT,
  SECURITY,
  AUTH_ERROR_CODES,
  server,
  notifications,
  CLIENT_ACCESS_ROLES,
  INTERNAL_ROLE_NAMES,
  MOCKS,
  jwt: jwtConfig
} = require('../../../../../shared/constants');
const {
  LoginResponseDTO,
  PolicyUpdateRequiredDTO,
  MFARequiredResponseDTO,
  TrustedDeviceListDTO,
  TrustedDeviceUpdateDTO
} = require('../dtos/auth-login.dto');

// ============================================================
// CONSTANTES
// ============================================================

const IS_BYPASS_ENABLED = server.nodeEnv === 'development' && server.bypass === 'true';

const SMS_CHALLENGE_EXPIRY_MINUTES = 15;
const SMS_MAX_ATTEMPTS = 5;
const SMS_CODE_MIN = 100000;
const SMS_CODE_MAX = 999999;

const BYPASS_TOKENS = {
  accessToken: 'bypass-access-token',
  idToken: 'bypass-id-token',
  refreshToken: 'bypass-refresh-token',
  expiresIn: 3600
};

class AuthLoginService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new AuthLoginService({ userRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.userRepository = deps.userRepository ?? userRepository;
    this.userLoginAttemptRepository = deps.userLoginAttemptRepository ?? userLoginAttemptRepository;
    this.verificationCodeRepository = deps.verificationCodeRepository ?? verificationCodeRepository;
    this.userSessionRepository = deps.userSessionRepository ?? userSessionRepository;
    this.trustedDeviceRepository = deps.trustedDeviceRepository ?? trustedDeviceRepository;
    this.privacyPolicyRepository = deps.privacyPolicyRepository ?? privacyPolicyRepository;
    this.consentRecorder = deps.consentRecorder ?? consentRecorder;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
    this.SmsService = deps.SmsService ?? SmsService;
  }

  // ============================================================
  // LOGIN
  // ============================================================

  async login(data, auditContext) {
    const { nationalId, password, acceptPolicy = false } = data;
    const { ip, userAgent, fingerprintHash } = auditContext;

    await this._checkAccountBlock(nationalId);

    const user = await this._getUserForLogin(nationalId);

    this._checkServerRole(user, auditContext.serverContext);

    const policyCheck = await this._checkPrivacyPolicy(user, acceptPolicy, ip);
    if (policyCheck) {
      return policyCheck;
    }

    const isValid = await this.userRepository.verifyPassword(password, user.password_hash);
    if (!isValid) {
      await this._handleFailedLogin(user, nationalId, { ip, userAgent, fingerprintHash }, 'Contrasena invalida');
    }

    if (IS_BYPASS_ENABLED) {
      logger.warn('[DEV] Bypass de autenticación activo en login', { userId: user.user_id });
      return this._completeSuccessfulLogin(user, nationalId, auditContext);
    }

    // ── Segundo factor (MFA) — gestionado íntegramente por nosotros ──────────────
    // La contraseña ya se validó arriba contra el hash bcrypt local. Si el usuario
    // tiene un método MFA preferido, emitimos el reto correspondiente en lugar de
    // completar el login directamente.
    if (user.preferred_mfa_method === 'totp') {
      logAudit(
        'MFA_REQUIRED',
        user.user_id,
        { nationalId, challengeType: 'SOFTWARE_TOKEN_MFA' },
        { entityId: user.user_id, entityType: 'User', entityTable: 'users' }
      );

      // El token de reto prueba que la contraseña ya pasó el paso 1: verify-mfa lo
      // exige antes de aceptar el código TOTP (reemplaza al `session` de Cognito).
      const challengeToken = await JwtUtil.generateMfaChallengeToken(user.user_id);

      return MFARequiredResponseDTO({
        username: user.auth_username,
        session: challengeToken,
        challengeType: 'SOFTWARE_TOKEN_MFA',
        preferredMfaMethod: 'totp'
      });
    }

    if (user.preferred_mfa_method === 'sms') {
      return this._issueSmsLoginChallenge(user, nationalId);
    }

    // Sin MFA: emitimos directamente nuestros tokens RS256.
    return this._completeSuccessfulLogin(user, nationalId, auditContext);
  }

  async verifyMFA(data, auditContext) {
    if (IS_BYPASS_ENABLED) {
      throw AppError.badRequest('[DEV] MFA no disponible en modo bypass. Usa /auth/login directamente.');
    }

    const { nationalId, totpCode, smsCode, session, acceptPolicy = false } = data;
    const { ip, userAgent, fingerprintHash } = auditContext;

    await this._checkAccountBlock(nationalId);

    const user = await this._getUserForLogin(nationalId);

    this._checkServerRole(user, auditContext.serverContext);

    const policyCheck = await this._checkPrivacyPolicy(user, acceptPolicy, ip);
    if (policyCheck) {
      return policyCheck;
    }

    if (user.preferred_mfa_method === 'sms') {
      await this._verifySmsLoginChallenge(user, nationalId, smsCode || totpCode, {
        ip,
        userAgent,
        fingerprintHash
      });
      return this._completeSuccessfulLogin(user, nationalId, auditContext);
    }

    // ── TOTP nativo ──────────────────────────────────────────────────────────────
    // El token de reto (session) prueba que la contraseña ya se validó en /auth/login;
    // sin esto, alguien con el nationalId y un código TOTP podría saltarse la contraseña.
    await this._assertMfaChallenge(session, user.user_id);

    const secret = user.totp_secret ? EncryptionUtil.decrypt(user.totp_secret) : null;
    if (!TotpUtil.verify(totpCode, secret)) {
      await this.userLoginAttemptRepository.recordAttempt({
        user_id: user.user_id,
        username_attempt: user.auth_username,
        national_id: nationalId,
        ip_address: ip,
        user_agent: userAgent,
        device_fingerprint: fingerprintHash,
        success: false,
        failure_reason: 'Codigo TOTP incorrecto',
        attempted_at: new Date()
      });

      // Evento forense de seguridad (Opción A): se mantiene a propósito pese al log
      // genérico que el middleware emite al propagar el throw. El intento queda además
      // persistido en user_login_attempts. No es duplicación a corregir.
      logAudit(
        'MFA_FAILED',
        user.user_id,
        {
          nationalId,
          reason: 'Codigo TOTP incorrecto'
        },
        { entityId: user.user_id, entityType: 'User', entityTable: 'users', outcome: 'failure' }
      );

      throw AppError.badRequest('Código TOTP incorrecto');
    }

    return this._completeSuccessfulLogin(user, nationalId, auditContext);
  }

  /**
   * Renueva un access token usando un refresh token RS256 válido.
   * El refresh token se rota: el JTI anterior se revoca y se emite uno nuevo.
   *
   * Detección de reuse attack:
   *   Si el JWT tiene firma válida pero el JTI ya no está en Redis, significa
   *   que el token ya fue usado (por el usuario legítimo o un atacante).
   *   Respuesta: invalidar todas las sesiones del usuario.
   */
  // [RF-AUTH-02] | CA-01 | Rotación de refresh token con detección de reuse attack.
  // Tope absoluto de sesión: la rotación NO resetea la vida de la sesión. En cada refresh se
  // verifica started_at + ABSOLUTE_SESSION_LIFETIME_HOURS (8h) y se rechaza si se superó,
  // aunque el usuario siga activo (Circular 052/2007 SFC).
  async refreshToken(refreshTokenStr) {
    if (IS_BYPASS_ENABLED) {
      logger.warn('[DEV] Bypass de autenticación activo en refreshToken');
      return {
        accessToken: BYPASS_TOKENS.accessToken,
        refreshToken: refreshTokenStr,
        expiresIn: 3600
      };
    }

    // 1. Verificar firma RS256 y expiración
    const decoded = await JwtUtil.verifyRefreshToken(refreshTokenStr);

    // 1b. Ventana de gracia — ANTES de la blacklist y del check de JTI, porque la rotación deja el
    //     token viejo marcado en ambos lugares y una llamada concurrente moriría antes de llegar acá.
    //     El front web dispara varias llamadas a la vez y, con el access recién vencido, todas piden
    //     refresh con la MISMA cookie: solo la primera rota, y sin esta ventana el resto se
    //     interpretaba como reuse attack (que cierra TODAS las sesiones del usuario). Se devuelve el
    //     par ya emitido: una sola rotación y todas las llamadas coherentes.
    //     No abre un agujero: la clave solo existe si NOSOTROS rotamos ese JTI hace <60s. Un logout
    //     blacklistea el token pero no escribe esta clave, así que ahí no hay gracia que valga.
    const rotated = await RefreshTokenStore.getRotation(decoded.jti);
    if (rotated) {
      logger.info('Refresh concurrente dentro de la ventana de gracia — se reusa el par emitido', {
        userId: decoded.userId,
        jti: decoded.jti
      });
      return rotated;
    }

    // 2. Verificar blacklist individual (logout de esta sesión)
    const isBlacklisted = await TokenBlacklistUtil.isRefreshTokenBlacklisted(refreshTokenStr);
    if (isBlacklisted) {
      throw AppError.unauthorized('La sesión ha expirado. Por favor inicia sesión nuevamente.', {
        code: AUTH_ERROR_CODES.SESSION_CLOSED
      });
    }

    // 3. Verificar invalidación global (logout-all / reuse attack). Se compara contra el iat del
    //    refresh token: un login posterior al evento emite tokens nuevos que deben poder renovar.
    const hasGlobalInvalidation = await TokenBlacklistUtil.isUserSessionsInvalidated(decoded.userId, decoded.iat);
    if (hasGlobalInvalidation) {
      throw AppError.unauthorized('La sesión ha expirado. Por favor inicia sesión nuevamente.', {
        code: AUTH_ERROR_CODES.SESSION_CLOSED
      });
    }

    // 4. Verificar JTI en Redis — detectar reuse attack
    const storedUserId = await RefreshTokenStore.exists(decoded.jti);
    if (!storedUserId) {
      // 4a. Redis caído ≠ token robado. exists() devuelve null en ambos casos; sin esta
      //     distinción, cada parpadeo de Redis cerraría todas las sesiones del usuario.
      //     Fail-open: se deja pasar la rotación (misma política que DeviceBlocklistUtil).
      if (!redisClient.isAvailable()) {
        logger.warn('Refresh sin verificación de JTI — Redis no disponible', {
          userId: decoded.userId,
          jti: decoded.jti
        });
      } else {
        // 4b. JTI ausente, Redis sano y fuera de la ventana de gracia (1b) → reuse real.
        return this._handleRefreshReuseAttack(decoded);
      }
    }

    // 5. Cargar usuario de BD (con rol para que generateAccessToken incluya roleId/roleName)
    const user = await this.userRepository.findById(decoded.userId, { include: [{ association: 'role' }] });
    if (!user || !user.is_active) {
      throw AppError.unauthorized('Usuario no encontrado o inactivo', { code: AUTH_ERROR_CODES.SESSION_CLOSED });
    }

    // 5b. Tope absoluto de sesión: la rotación del refresh no puede extender la sesión más
    //     allá de started_at + 8h. Aplica a clientes e internos por igual.
    if (decoded.sessionId) {
      await this._enforceAbsoluteSessionLifetime(decoded.sessionId, decoded.userId, decoded.jti);
    }

    // 6. Revocar el JTI actual (atomic: antes de emitir el nuevo)
    await RefreshTokenStore.revoke(decoded.jti);

    // 7. Emitir nuevos tokens (conservando el sessionId de la sesión original)
    //    refreshTs marca el momento de la rotación: cualquier token de esta sesión con iat
    //    anterior queda invalidado (con efecto diferido por la gracia) y prevalece el nuevo.
    const refreshTs = Math.floor(Date.now() / 1000);
    const newJti = crypto.randomUUID();
    const newAccessToken = await JwtUtil.generateAccessToken(user, decoded.sessionId);
    const newRefreshToken = await JwtUtil.generateRefreshToken(decoded.userId, newJti, decoded.sessionId);

    // 8. Guardar el nuevo JTI (awaited — si falla, el nuevo refresh token es inútil)
    const saved = await RefreshTokenStore.save(newJti, decoded.userId);
    if (!saved) {
      // Revertir: el viejo JTI ya fue revocado, no podemos revertirlo
      // El usuario deberá hacer login de nuevo
      throw AppError.internal('Error al renovar la sesión. Por favor inicia sesión nuevamente.');
    }

    // 9. Efectos de la rotación: matar el refresh viejo, correr el umbral de la sesión y
    //    actualizar la fila en BD. Todos fire-and-forget.
    this._applyRotationSideEffects(decoded, { refreshTokenStr, refreshTs, newJti });

    logAudit(
      'TOKEN_REFRESHED',
      decoded.userId,
      { jti: decoded.jti, newJti },
      { entityId: decoded.userId, entityType: 'User', entityTable: 'users' }
    );

    const tokens = {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: jwtConfig.accessTokenExpiry
    };

    // 11. Abrir la ventana de gracia (awaited): durante los próximos
    //     SECURITY.REFRESH_ROTATION_GRACE_SECONDS, cualquier llamada concurrente que llegue con el
    //     JTI que acabamos de consumir recibe ESTE mismo par en vez de disparar un reuse attack.
    //     Se espera a propósito — si se resolviera después de responder, la ráfaga que viene atrás
    //     encontraría la ventana todavía vacía, que es justo el caso que esto evita.
    await RefreshTokenStore.saveRotation(decoded.jti, tokens);

    return tokens;
  }

  /**
   * Efectos secundarios de una rotación de refresh ya consumada. Todos fire-and-forget: el par
   * nuevo ya es válido y ninguno de estos pasos debe poder tumbar la renovación.
   *
   * @param {Object} decoded - payload del refresh token consumido
   * @param {{refreshTokenStr: string, refreshTs: number, newJti: string}} rotation
   * @private
   */
  _applyRotationSideEffects(decoded, { refreshTokenStr, refreshTs, newJti }) {
    // El refresh viejo deja de servir de inmediato.
    TokenBlacklistUtil.blacklistRefreshToken(refreshTokenStr).catch(err =>
      logger.warn('Error añadiendo refresh token expirado a blacklist', { error: err.message })
    );

    if (!decoded.sessionId) {
      return;
    }

    // Invalida el access token anterior de esta sesión — prevalece el nuevo. El umbral es DIFERIDO
    // (misma duración que la ventana de gracia, pero contada sobre la hora del request, no sobre el
    // iat): al rotar de forma proactiva siempre hay requests en vuelo con la cookie vieja, y un
    // margen por iat no los salvaba nunca — el access anterior tiene un iat de minutos atrás, así
    // que moría al instante y esos requests caían con "sesión cerrada", que el front lee como logout.
    TokenBlacklistUtil.invalidateSessionTokensOnRotation(decoded.sessionId, refreshTs).catch(err =>
      logger.warn('Error invalidando access token anterior tras refresh', {
        error: err.message,
        sessionId: decoded.sessionId
      })
    );

    // Rota el JTI en BD y marca actividad (last_access_at).
    this.userSessionRepository.updateJtiAndLastAccess(decoded.sessionId, newJti).catch(err =>
      logger.warn('Error actualizando JTI de sesión en BD', {
        error: err.message,
        sessionId: decoded.sessionId
      })
    );
  }

  /**
   * Reuse attack confirmado: firma válida, JTI ausente, Redis sano y fuera de la ventana de gracia.
   * El token ya fue consumido y alguien lo está reusando → se cierran TODAS las sesiones del usuario
   * (decisión del dev, 2026-07-22: ante un ataque real se cierra todo).
   *
   * Antes de eso descarta el falso positivo más caro: una sesión **cerrada legítimamente** (logout
   * desde otro dispositivo, revocación del admin, worker de inactividad) también deja su JTI
   * revocado. Si el front intentaba renovar sin saberlo, se leía como ataque y la revocación de UNA
   * sesión terminaba tumbando TODAS las del usuario. Con la sesión cerrada en BD, la respuesta
   * correcta es un 401 normal.
   *
   * @private
   */
  // [RF-AUTH-02] | CA-01 | Reuse attack → invalidación global de las sesiones del usuario
  async _handleRefreshReuseAttack(decoded) {
    if (decoded.sessionId) {
      const session = await this.userSessionRepository.findById(decoded.sessionId);
      if (session && session.status !== 'active') {
        logger.info('Refresh sobre sesión ya cerrada — no es reuse attack', {
          userId: decoded.userId,
          sessionId: decoded.sessionId,
          closeReason: session.close_reason
        });
        throw AppError.unauthorized('La sesión ha sido cerrada. Por favor inicia sesión nuevamente.', {
          code: AUTH_ERROR_CODES.SESSION_CLOSED
        });
      }
    }

    logger.warn('Reuse attack detectado — invalidando todas las sesiones', {
      userId: decoded.userId,
      jti: decoded.jti
    });

    // Evento forense de seguridad (Opción A): incidente distinto de "el request falló".
    // Se mantiene aunque la ruta declare TOKEN_REFRESHED y el middleware loguee el fallo.
    logAudit(
      'REFRESH_TOKEN_REUSE_ATTACK',
      decoded.userId,
      { jti: decoded.jti },
      { entityId: decoded.userId, entityType: 'User', entityTable: 'users', outcome: 'failure' }
    );

    TokenBlacklistUtil.invalidateUserSessions(decoded.userId).catch(err =>
      logger.warn('Error invalidando sesiones tras reuse attack', { error: err.message })
    );

    throw AppError.unauthorized('Sesión comprometida. Por favor inicia sesión nuevamente.', {
      code: AUTH_ERROR_CODES.SESSION_COMPROMISED
    });
  }

  // [RF-AUTH-02] | CA-01 | Tope absoluto de vida de la sesión. Se llama en cada refresh:
  // la rotación del refresh token no puede extender la sesión más allá de started_at + 8h.
  // Cierra la sesión, revoca el JTI, blacklista y lanza 401 si se superó el límite.
  async _enforceAbsoluteSessionLifetime(sessionId, userId, jti) {
    const session = await this.userSessionRepository.findById(sessionId);
    if (!session || session.status !== 'active') {
      return;
    }
    const lifetimeMs = SECURITY.ABSOLUTE_SESSION_LIFETIME_HOURS * 60 * 60 * 1000;
    const expiresAt = new Date(session.started_at).getTime() + lifetimeMs;
    if (Date.now() < expiresAt) {
      return;
    }

    await this.userSessionRepository.closeSession(sessionId, 'absolute_lifetime');
    RefreshTokenStore.revoke(jti).catch(err =>
      logger.warn('Error revocando JTI al expirar sesión por tope absoluto', { error: err.message, sessionId })
    );
    TokenBlacklistUtil.blacklistSession(sessionId).catch(err =>
      logger.warn('Error invalidando sesión en blacklist por tope absoluto', { error: err.message, sessionId })
    );
    logAudit(
      'SESSION_ABSOLUTE_EXPIRED',
      userId,
      { startedAt: session.started_at, limitHours: SECURITY.ABSOLUTE_SESSION_LIFETIME_HOURS },
      { entityId: sessionId, entityType: 'UserSession', entityTable: 'user_sessions' }
    );
    throw AppError.unauthorized('La sesión alcanzó su duración máxima (8 horas). Por favor inicia sesión nuevamente.', {
      code: AUTH_ERROR_CODES.SESSION_ABSOLUTE_LIFETIME
    });
  }

  // ============================================================
  // LOGOUT
  // ============================================================

  /**
   * @param {string} userId
   * @param {string} fingerprintHash
   * @param {Object} tokens
   * @param {string} tokens.accessToken   - Access token JWT de la sesión actual
   * @param {number} tokens.tokenExp      - Unix timestamp de expiración del access token
   * @param {string} [tokens.refreshToken] - Refresh token (disponible en web y mobile que lo envíe)
   */
  // [RF-AUTH-02] | CA-02 | Logout individual: blacklistea access y refresh, cierra sesión en BD
  async logout(userId, fingerprintHash, tokens = {}) {
    const { accessToken, tokenExp, refreshToken, sessionId } = tokens;

    // Cerrar la sesión en BD
    if (sessionId) {
      this.userSessionRepository.closeSession(sessionId, 'logout').catch(err =>
        logger.warn('Error cerrando sesión en BD en logout', {
          error: err.message,
          userId,
          sessionId
        })
      );
    }

    // Invalidar access token — impide su uso aunque aún no haya expirado
    TokenBlacklistUtil.blacklistAccessToken(accessToken, tokenExp).catch(err =>
      logger.warn('Error añadiendo access token a blacklist en logout', {
        error: err.message,
        userId
      })
    );

    // Invalidar refresh token si está disponible
    if (refreshToken) {
      TokenBlacklistUtil.blacklistRefreshToken(refreshToken).catch(err =>
        logger.warn('Error añadiendo refresh token a blacklist en logout', {
          error: err.message,
          userId
        })
      );
    }

    await this.trustedDeviceRepository
      .updateLastSeen(userId, fingerprintHash)
      .catch(err => logger.warn('Error updating last_seen on logout', { error: err.message }));

    logAudit('LOGOUT', userId, { fingerprintHash }, { entityId: userId, entityType: 'User', entityTable: 'users' });

    return null;
  }

  /**
   * @param {string} userId
   * @param {Object} tokens
   * @param {string} tokens.accessToken - Access token JWT de la sesión actual
   * @param {number} tokens.tokenExp    - Unix timestamp de expiración del access token
   */
  // [RF-AUTH-02] | CA-02 | Logout global: invalida todas las sesiones del usuario.
  // Todo el control de sesiones es propio (blacklist + rotación de refresh en Redis/BD),
  // así que basta con invalidar aquí — no hay proveedor externo que sincronizar.
  async logoutAll(userId, tokens = {}) {
    const { accessToken, tokenExp, firstName } = tokens;

    // Invalidar el access token actual en Redis. La invalidación global de más abajo
    // cubre además los access tokens de otras sesiones que aún no hayan expirado.
    TokenBlacklistUtil.blacklistAccessToken(accessToken, tokenExp).catch(err =>
      logger.warn('Error añadiendo access token a blacklist en logout-all', {
        error: err.message,
        userId
      })
    );

    // Marcar todas las sesiones como invalidadas — cubre access tokens de otras
    // sesiones que aún no han expirado y no fueron individualmente blacklisteados
    TokenBlacklistUtil.invalidateUserSessions(userId).catch(err =>
      logger.warn('Error invalidando sesiones de usuario en logout-all', {
        error: err.message,
        userId
      })
    );

    // Cerrar todas las sesiones activas en BD
    this.userSessionRepository
      .closeAllByUser(userId, 'logout_all')
      .catch(err => logger.warn('Error cerrando sesiones en BD en logout-all', { error: err.message, userId }));

    await this.trustedDeviceRepository.deleteAllByUser(userId);

    logAudit('LOGOUT_ALL', userId, {}, { entityId: userId, entityType: 'User', entityTable: 'users' });

    // Notificar al usuario que todas sus sesiones fueron cerradas (fire-and-forget)
    setImmediate(() => {
      this.NotificationUtil.crearNotificacion({
        tipoNotificacion: 'LOGOUT_ALL',
        userId,
        metadata: { nombre: firstName || 'Usuario' }
      }).catch(err => logger.warn('Error enviando notificación logout all', { error: err.message }));
    });

    return null;
  }

  // ============================================================
  // TRUSTED DEVICES
  // ============================================================

  // === RF-AUTH-03: Gestión de Dispositivos Autenticados y Control de Sesiones ===
  // [RF-AUTH-03] | CA-01 | Devuelve lista de dispositivos del usuario con browser,
  // os, device_type, ip_address, city, country, last_seen_at y flag de sesión actual
  async getTrustedDevices(userId, currentFingerprintHash, currentSessionId = null) {
    const devices = await this.trustedDeviceRepository.findAllByUserWithSessions(userId);

    logAudit(
      'TRUSTED_DEVICES_VIEWED',
      userId,
      { deviceCount: devices.length },
      { entityId: userId, entityType: 'User', entityTable: 'users' }
    );

    return TrustedDeviceListDTO(devices, currentFingerprintHash, currentSessionId);
  }

  async getPendingDevices(userId) {
    const devices = await this.trustedDeviceRepository.findAllPending(userId);

    logAudit(
      'PENDING_DEVICES_VIEWED',
      userId,
      { deviceCount: devices.length },
      { entityId: userId, entityType: 'User', entityTable: 'users' }
    );

    return TrustedDeviceListDTO(devices, null);
  }

  async renameDevice(userId, deviceId, deviceName) {
    const device = await this.trustedDeviceRepository.findByIdAndUser(deviceId, userId);
    if (!device) {
      throw AppError.notFound('Dispositivo no encontrado');
    }

    const updated = await this.trustedDeviceRepository.rename(deviceId, deviceName);

    logAudit(
      'TRUSTED_DEVICE_RENAMED',
      userId,
      { newName: deviceName },
      { entityId: deviceId, entityType: 'UserTrustedDevice', entityTable: 'user_trusted_devices' }
    );

    return TrustedDeviceUpdateDTO(updated);
  }

  /**
   * Bloquea un dispositivo (trusted o pending).
   * Solo puede ejecutarse desde un dispositivo TRUSTED.
   * Siempre debe quedar al menos un dispositivo trusted.
   */
  async blockDevice(userId, deviceId, currentFingerprintHash) {
    // Verificar que quien bloquea es TRUSTED
    const currentDevice = await this.trustedDeviceRepository.findByFingerprint(userId, currentFingerprintHash);

    if (!currentDevice || currentDevice.status !== 'trusted') {
      throw AppError.forbidden('Solo puedes bloquear dispositivos desde un dispositivo de confianza');
    }

    // No puedes bloquearte a ti mismo
    if (currentDevice.user_trusted_device_id === deviceId) {
      throw AppError.badRequest('No puedes bloquear tu propio dispositivo. Usa el endpoint de logout');
    }

    // Verificar que el dispositivo a bloquear existe y pertenece al usuario
    const targetDevice = await this.trustedDeviceRepository.findByIdAndUser(deviceId, userId);
    if (!targetDevice) {
      throw AppError.notFound('Dispositivo no encontrado');
    }
    if (targetDevice.status === 'blocked') {
      throw AppError.badRequest('El dispositivo ya está bloqueado');
    }

    // Garantizar que siempre quede al menos un trusted
    if (targetDevice.status === 'trusted') {
      const trustedCount = await this.trustedDeviceRepository.countTrusted(userId);
      if (trustedCount <= 1) {
        throw AppError.badRequest('No puedes bloquear el único dispositivo de confianza. Promueve otro dispositivo primero');
      }
    }

    const updated = await this.trustedDeviceRepository.block(deviceId);

    // ── Invalidación inmediata del access token en Redis ─────────────────────
    // Los access tokens no se pueden revocar por sí mismos, así que escribimos el
    // fingerprint del dispositivo bloqueado en Redis para que el auth middleware lo rechace
    // en el próximo request, sin esperar a que el token expire (~1h).
    // El TTL de la clave es DEFAULT_TTL (1h) ya que no conocemos el exp del
    // token activo del dispositivo bloqueado en este momento.
    DeviceBlocklistUtil.block(userId, targetDevice.fingerprint_hash).catch(err =>
      logger.warn('Error escribiendo blocklist en Redis tras blockDevice', {
        error: err.message,
        userId,
        deviceId,
        fingerprintHash: targetDevice.fingerprint_hash
      })
    );

    logAudit(
      'TRUSTED_DEVICE_BLOCKED',
      userId,
      {
        blockedByDeviceId: currentDevice.user_trusted_device_id
      },
      { entityId: deviceId, entityType: 'UserTrustedDevice', entityTable: 'user_trusted_devices' }
    );

    return TrustedDeviceUpdateDTO(updated);
  }

  /**
   * Desbloquea un dispositivo BLOCKED → vuelve a PENDING.
   * Solo puede ejecutarse desde un dispositivo TRUSTED.
   */
  async unblockDevice(userId, deviceId, currentFingerprintHash) {
    // Verificar que quien desbloquea es TRUSTED
    const currentDevice = await this.trustedDeviceRepository.findByFingerprint(userId, currentFingerprintHash);
    if (!currentDevice || currentDevice.status !== 'trusted') {
      throw AppError.forbidden('Solo puedes desbloquear dispositivos desde un dispositivo de confianza');
    }

    // Verificar que el dispositivo a desbloquear existe y está bloqueado
    const targetDevice = await this.trustedDeviceRepository.findByIdAndUser(deviceId, userId);
    if (!targetDevice) {
      throw AppError.notFound('Dispositivo no encontrado');
    }
    if (targetDevice.status !== 'blocked') {
      throw AppError.badRequest('El dispositivo no está bloqueado');
    }

    // Al desbloquear vuelve a pending (requiere aprobación de un trusted para operar)
    const updated = await this.trustedDeviceRepository.unblock(deviceId);

    // ── Limpiar la entrada de Redis ──────────────────────────────────────────
    // Si la clave aún existe (el token original no expiró), la eliminamos
    // para que el dispositivo pueda operar de inmediato una vez lo aprueben.
    DeviceBlocklistUtil.unblock(userId, targetDevice.fingerprint_hash).catch(err =>
      logger.warn('Error eliminando blocklist en Redis tras unblockDevice', {
        error: err.message,
        userId,
        deviceId,
        fingerprintHash: targetDevice.fingerprint_hash
      })
    );

    logAudit(
      'TRUSTED_DEVICE_UNBLOCKED',
      userId,
      {
        unblockedByDeviceId: currentDevice.user_trusted_device_id
      },
      { entityId: deviceId, entityType: 'UserTrustedDevice', entityTable: 'user_trusted_devices' }
    );

    return TrustedDeviceUpdateDTO(updated);
  }

  /**
   * Aprueba un dispositivo PENDING → pasa a TRUSTED.
   * Solo puede ejecutarse desde un dispositivo TRUSTED.
   */
  async approveDevice(userId, deviceId, currentFingerprintHash) {
    // Verificar que el dispositivo actual es TRUSTED (quien aprueba)

    const currentDevice = await this.trustedDeviceRepository.findByFingerprint(userId, currentFingerprintHash);
    if (!currentDevice || currentDevice.status !== 'trusted') {
      throw AppError.forbidden('Solo puedes aprobar dispositivos desde un dispositivo de confianza');
    }

    // Verificar que el dispositivo a aprobar pertenece al usuario y está PENDING
    const pendingDevice = await this.trustedDeviceRepository.findByIdAndUser(deviceId, userId);
    if (!pendingDevice) {
      throw AppError.notFound('Dispositivo no encontrado');
    }
    if (pendingDevice.status !== 'pending') {
      throw AppError.badRequest('El dispositivo no está pendiente de aprobación');
    }

    const approved = await this.trustedDeviceRepository.approve(deviceId, currentDevice.user_trusted_device_id);

    logAudit(
      'TRUSTED_DEVICE_APPROVED',
      userId,
      {
        approvedByDeviceId: currentDevice.user_trusted_device_id
      },
      { entityId: deviceId, entityType: 'UserTrustedDevice', entityTable: 'user_trusted_devices' }
    );

    return TrustedDeviceUpdateDTO(approved);
  }

  // ============================================================
  // PRIVATE
  // ============================================================

  /**
   * Verifica si el usuario tiene la versión activa de la política de privacidad.
   * Si el request trae `acceptPolicy: true`, registra la versión activa y deja continuar el login
   * y deja continuar el login en un solo paso.
   *
   * Retorna:
   *   null                     → política al día (o aceptada en este request), el login continúa
   *   PolicyUpdateRequiredDTO  → política desactualizada y no se aceptó en este request
   *
   * @param {Object} user
   * @param {boolean} acceptPolicy - true si el usuario aceptó la política en este request
   * @param {string|null} ip
   * @private
   */
  async _checkPrivacyPolicy(user, acceptPolicy, ip) {
    const activePolicy = await this.privacyPolicyRepository.findActive();

    // Los usuarios internos no están sujetos a la política de privacidad de clientes.
    const roleName = user.role?.name;
    const isInternalUser = INTERNAL_ROLE_NAMES.includes(roleName);
    if (isInternalUser) {
      return null;
    }

    // Sin política activa configurada → dejamos pasar
    if (!activePolicy) {
      return null;
    }

    // Ya tiene la versión activa → OK
    if (user.privacy_policy_version === activePolicy.version) {
      return null;
    }

    // El cliente aceptó en este mismo request → registrar y dejar pasar
    if (acceptPolicy === true) {
      await this.userRepository.updatePrivacyPolicy(user.user_id, {
        version: activePolicy.version,
        acceptedAt: new Date(),
        acceptedIp: ip || null
      });

      // RF-ADM-04: registrar trazabilidad granular en user_consents
      await this.consentRecorder
        .grantPrivacyPolicy({ userId: user.user_id, privacyPolicyId: activePolicy.privacy_policy_id, ip }).catch(err =>
        logger.warn('auth-login: no se pudo registrar user_consent de privacy policy', {
          userId: user.user_id,
          error: err.message
        })
      );

      logAudit(
        'PRIVACY_POLICY_ACCEPTED',
        user.user_id,
        {
          version: activePolicy.version,
          ip: ip || null
        },
        { entityType: 'PrivacyPolicy', entityTable: 'privacy_policies' }
      );

      return null;
    }

    logAudit(
      'LOGIN_BLOCKED_POLICY_UPDATE',
      user.user_id,
      {
        userVersion: user.privacy_policy_version || 'ninguna',
        activeVersion: activePolicy.version
      },
      { entityType: 'PrivacyPolicy', entityTable: 'privacy_policies', outcome: 'failure' }
    );

    return PolicyUpdateRequiredDTO({
      currentVersion: user.privacy_policy_version || null,
      newVersion: activePolicy.version,
      documentUrl: activePolicy.document_url,
      summary: activePolicy.summary,
      effectiveDate: activePolicy.effective_date
    });
  }

  /** @private */
  _checkServerRole(user, serverContext) {
    if (!serverContext) {
      return;
    }
    const allowedRoles = {
      // El portal admin admite todos los roles INTERNOS (SUPERADMIN/ADMIN/AUDITOR).
      // Qué puede hacer cada uno lo decide RbacMiddleware por ruta; aquí solo se
      // controla el acceso al portal.
      admin: [...INTERNAL_ROLE_NAMES],
      // El portal cliente admite el rol CLIENTE.
      client: CLIENT_ACCESS_ROLES
    };
    const allowed = allowedRoles[serverContext];
    if (allowed && !allowed.includes(user.role?.name)) {
      throw AppError.forbidden('No tienes permiso para acceder a este portal');
    }
  }

  /** @private */
  // [RF-AUTH-02] | CA-05 | Segunda capa de rate limiting por cuenta (bonus, no exigido por CA-05)
  async _checkAccountBlock(nationalId) {
    // Verificar bloqueo en Redis (primario)
    const redisSecs = await LoginRateLimiter.checkAccountBlock(nationalId);
    if (redisSecs !== null) {
      const minutes = Math.ceil(redisSecs / 60);
      throw AppError.tooManyRequests(
        `Cuenta bloqueada temporalmente. Intenta nuevamente en ${minutes} minuto(s)`,
        null,
        redisSecs
      );
    }

    // Fallback: verificar bloqueo en DB (si Redis no está disponible)
    const blockStatus = await this.userLoginAttemptRepository.checkIfBlocked(nationalId);
    if (blockStatus?.blocked) {
      const retrySecs = blockStatus.remainingMinutes * 60;
      throw AppError.tooManyRequests(
        `Cuenta bloqueada temporalmente. Intenta nuevamente en ${blockStatus.remainingMinutes} minuto(s)`,
        null,
        retrySecs
      );
    }
  }

  /** @private */
  async _getUserForLogin(nationalId) {
    const user = await this.userRepository.findByUsernameAndNationalId(nationalId, 'login');
    if (!user) {
      throw AppError.badRequest('Credenciales invalidas');
    }
    if (!user.is_active) {
      throw AppError.forbidden('Cuenta inactiva o suspendida');
    }
    return user;
  }

  /** @private */
  // [RF-AUTH-02] | CA-05 | Segunda capa de rate limiting por cuenta (bonus, no exigido por CA-05)
  async _handleFailedLogin(user, nationalId, auditContext, reason) {
    // Registrar el intento en BD para auditoría (sin blocked_until — el bloqueo lo gestiona Redis)
    await this.userLoginAttemptRepository.recordAttempt({
      user_id: user.user_id,
      username_attempt: user.auth_username,
      national_id: nationalId,
      ip_address: auditContext.ip,
      user_agent: auditContext.userAgent,
      device_fingerprint: auditContext.fingerprintHash,
      success: false,
      failure_reason: reason,
      attempted_at: new Date()
    });

    // Incrementar contador Redis y verificar si se superó el límite
    const blockSecs = await LoginRateLimiter.incrementAccountFailures(nationalId);
    const MAX = LOGIN_RATE_LIMIT.ACCOUNT_MAX_ATTEMPTS;

    // Eventos forenses de seguridad (Opción A): LOGIN_FAILED y ACCOUNT_BLOCKED se mantienen
    // a propósito pese al log genérico que el middleware emite al propagar el throw. El intento
    // queda además persistido en user_login_attempts. No son duplicación a corregir.
    logAudit(
      'LOGIN_FAILED',
      user.user_id,
      {
        nationalId,
        reason,
        blocked: blockSecs !== null
      },
      { entityId: user.user_id, entityType: 'User', entityTable: 'users', outcome: 'failure' }
    );

    if (blockSecs !== null) {
      const minutes = Math.ceil(blockSecs / 60);
      logAudit(
        'ACCOUNT_BLOCKED',
        user.user_id,
        {
          nationalId,
          blockSecs,
          reason: `${MAX} intentos fallidos consecutivos`
        },
        { entityId: user.user_id, entityType: 'User', entityTable: 'users', outcome: 'failure' }
      );

      // Notificar al usuario que su cuenta quedó bloqueada (fire-and-forget)
      this.NotificationUtil.crearNotificacion({
        tipoNotificacion: 'ACCOUNT_BLOCKED',
        userId: user.user_id,
        metadata: {
          nombre: user.person?.first_name || 'Usuario',
          intentosFallidos: MAX,
          minutosBloqueo: minutes
        }
      }).catch(err => logger.warn('Error enviando notificación account blocked', { error: err.message }));

      throw AppError.tooManyRequests(
        `Cuenta bloqueada por ${minutes} minutos debido a múltiples intentos fallidos`,
        null,
        blockSecs
      );
    }

    throw AppError.badRequest('Contraseña incorrecta');
  }

  /**
   * Valida el token de reto MFA emitido en /auth/login antes de aceptar el segundo
   * factor. Garantiza que la contraseña ya se validó (paso 1) y que el reto pertenece
   * a este mismo usuario. Lanza 401 si el token es inválido, expiró o no corresponde.
   *
   * @private
   */
  async _assertMfaChallenge(session, userId) {
    if (!session) {
      throw AppError.unauthorized('Falta el token de reto MFA. Vuelve a iniciar sesión.');
    }
    const payload = await JwtUtil.verifyMfaChallengeToken(session);
    if (payload.userId !== userId) {
      throw AppError.unauthorized('El reto MFA no corresponde a este usuario. Vuelve a iniciar sesión.');
    }
  }

  /** @private */
  async _completeSuccessfulLogin(user, nationalId, auditContext) {
    const { ip, userAgent, fingerprintHash } = auditContext;

    // ── Manejo de dispositivo (SÍNCRONO — puede bloquear el login si es PENDING) ──
    const deviceResult = await this._handleTrustedDevice(user, auditContext);

    // ── Una sesión por dispositivo + límite de sesiones simultáneas ──────────────
    // Cerrar la previa ANTES de contar el tope: una sesión abandonada del mismo
    // dispositivo no debe consumir cupo de los 5 ni empujar al cierre una sesión
    // real en otro dispositivo. Mismo orden que el login biométrico.
    await this._closePreviousDeviceSessions(user.user_id, deviceResult.deviceId);
    await this._enforceSessionLimit(user.user_id);

    // ── Limpiar invalidación global previa (logout-all) ──────────────────────────
    // Permite que el nuevo refresh token funcione correctamente en /auth/refresh.
    TokenBlacklistUtil.clearUserInvalidation(user.user_id).catch(err =>
      logger.warn('Error limpiando invalidación de usuario en login', {
        error: err.message,
        userId: user.user_id
      })
    );

    // ── Resetear contadores Redis de intentos fallidos ────────────────────────
    LoginRateLimiter.resetAccountCounters(nationalId).catch(err =>
      logger.warn('Error reseteando contadores de login en Redis', {
        error: err.message,
        userId: user.user_id
      })
    );

    // ── Emitir tokens RS256 propios ───────────────────────────────────────────────
    const sessionId = crypto.randomUUID();
    const jti = crypto.randomUUID();
    const accessToken = await JwtUtil.generateAccessToken(user, sessionId);
    const refreshToken = await JwtUtil.generateRefreshToken(user.user_id, jti, sessionId);

    // Guardar JTI (awaited — si falla el refresh token no servirá)
    const jtiSaved = await RefreshTokenStore.save(jti, user.user_id);
    if (!jtiSaved) {
      logger.warn('No se pudo guardar JTI de refresh token en login', {
        userId: user.user_id
      });
      // No bloqueamos el login — el refresh simplemente no funcionará hasta que Redis esté disponible
    }

    // Crear registro de sesión activa en BD (fire-and-forget)
    // [RF-AUTH-02] | CA-04 | Registra IP, user-agent, started_at, last_access_at al crear sesión
    this.userSessionRepository
      .create({
        user_session_id: sessionId,
        user_id: user.user_id,
        device_id: deviceResult.deviceId || null,
        jti,
        ip_address: ip || null,
        user_agent: userAgent || null,
        started_at: new Date(),
        last_access_at: new Date()
      })
      .catch(err =>
        logger.warn('Error creando registro de sesión en BD', {
          error: err.message,
          userId: user.user_id
        })
      );

    const tokens = { accessToken, refreshToken, expiresIn: jwtConfig.accessTokenExpiry };

    // ── Registro push token (solo mobile, fire-and-forget) ───────────────────────
    // No bloquea el login — si falla, se loguea el error y se continúa
    const { pushToken, pushDeviceId, pushPlatform } = auditContext;

    if (pushToken && pushPlatform) {
      this._registrarPushToken(user.user_id, pushToken, pushPlatform, pushDeviceId).catch(err =>
        logger.warn('Error registrando push token en login', {
          error: err.message,
          userId: user.user_id
        })
      );
    }

    // ── Registro del intento exitoso ─────────────────────────
    await this.userLoginAttemptRepository.recordAttempt({
      user_id: user.user_id,
      username_attempt: user.auth_username,
      national_id: nationalId,
      ip_address: ip,
      user_agent: userAgent,
      device_fingerprint: fingerprintHash,
      success: true,
      attempted_at: new Date(),
      // Explícito: `POST /auth/login` es ruta pública y no pasa por AuthMiddleware.authenticate, así que
      // el AsyncLocalStorage no tiene el sessionId aunque la sesión ya se creó unas líneas más arriba.
      // Ata el intento exitoso a su sesión — es lo que `session_cache_key` prometía y nunca cumplió.
      origin_session_id: sessionId
    });

    logAudit(
      'LOGIN_SUCCESS',
      user.user_id,
      {
        nationalId,
        fingerprintHash,
        deviceId: deviceResult.deviceId
      },
      { entityId: user.user_id, entityType: 'User', entityTable: 'users' }
    );

    return LoginResponseDTO({
      user,
      tokens,
      deviceId: deviceResult.deviceId,
      // Solo mobile recibe el hmacSecret del dispositivo — lo guarda en el keychain
      // La web usa cookies httpOnly y no necesita HMAC
      deviceHmacSecret: auditContext.clientType === 'mobile' ? deviceResult.deviceHmacSecret : null
    });
  }

  /**
   * Registra o actualiza el push token del dispositivo móvil en SNS y BD.
   *
   * Lógica:
   *   - Si ya existe un registro con ese device_id → actualiza user_id + endpointArn
   *     (cubre el caso de un dispositivo compartido entre usuarios distintos)
   *   - Si no existe → crea un registro nuevo
   *
   * Siempre es fire-and-forget: los errores se loguean pero no afectan el login.
   *
   * @param {string}      userId      - ID del usuario que se está logueando
   * @param {string}      fcmToken    - Token FCM obtenido por la app móvil
   * @param {string}      platform    - 'android' | 'ios'
   * @param {string|null} deviceId    - ID único del dispositivo (opcional)
   * @private
   */
  async _registrarPushToken(userId, fcmToken, platform, deviceId = null) {
    try {
      const pushService = require('../../../../schemas/notification/services/push-notification.service');
      const userPushTokenRepo = require('../../../../schemas/notification/repositories/user-push-token.repository');

      // 1. Registrar en AWS SNS → devuelve el endpointArn
      //    Si el token FCM cambió, SNS lo actualiza internamente
      const endpointArn = await pushService.registrarDispositivo(fcmToken, platform, userId);

      // 2. Upsert en BD:
      //    - Busca por device_id primero, luego por token
      //    - Si encuentra → sobreescribe user_id (maneja cambio de usuario en mismo dispositivo)
      //    - Si no encuentra → crea nuevo registro
      await userPushTokenRepo.upsertToken(userId, endpointArn, platform, deviceId);

      logger.info('Push token registrado exitosamente en login', {
        userId,
        platform,
        deviceId: deviceId || 'sin device_id'
      });
    } catch (error) {
      // No relanzar — este error no debe interrumpir el login
      logger.warn('Error al registrar push token en login', {
        error: error.message,
        userId,
        platform,
        deviceId
      });
    }
  }

  /**
   * Maneja el ciclo de vida del dispositivo en cada login.
   * Corre síncronamente — su resultado puede bloquear el login.
   *
   * Retorna:
   *   { requiresApproval: false, deviceId }  → login puede continuar
   *   { requiresApproval: true,  deviceId }  → login bloqueado
   *
   * @private
   */
  // [RF-AUTH-03] | CA-03 | Detecta si el dispositivo es nuevo por fingerprint hash.
  // Dispositivo conocido desde IP/ubicación distinta no genera alerta (decisión técnica:
  // evitar ruido por VPNs y roaming)
  async _handleTrustedDevice(user, auditContext) {
    const { ip, userAgent, fingerprintHash } = auditContext;

    // ── ¿El dispositivo ya existe? ───────────────────────────
    const existing = await this.trustedDeviceRepository.findByFingerprint(user.user_id, fingerprintHash);
    if (existing) {
      return this._handleExistingDevice(user.user_id, fingerprintHash, existing);
    }

    // ── Dispositivo nuevo ────────────────────────────────────
    const enriched = DeviceFingerprintUtil.enrichDevice(userAgent, ip);
    const trustedCount = await this.trustedDeviceRepository.countTrusted(user.user_id);
    const isFirstDevice = trustedCount === 0;

    if (isFirstDevice) {
      return this._registerFirstDevice(user, fingerprintHash, ip, enriched);
    }

    return this._registerPendingDevice(user, fingerprintHash, ip, enriched);
  }

  /** @private */
  async _handleExistingDevice(userId, fingerprintHash, existing) {
    if (existing.status === 'blocked') {
      // Evento forense de seguridad (Opción A): política de dispositivo bloqueado.
      // Se mantiene pese al log genérico del middleware al propagar el throw.
      logAudit(
        'LOGIN_BLOCKED_DEVICE',
        userId,
        {},
        {
          entityId: existing.user_trusted_device_id,
          entityType: 'UserTrustedDevice',
          entityTable: 'user_trusted_devices',
          outcome: 'failure'
        }
      );
      throw AppError.forbidden('Este dispositivo ha sido bloqueado. Desbloquéalo desde otro dispositivo de confianza.');
    }

    // trusted o pending → puede loguearse, actualiza last_seen
    await this.trustedDeviceRepository.updateLastSeen(userId, fingerprintHash);
    return {
      requiresApproval: false,
      deviceId: existing.user_trusted_device_id,
      deviceHmacSecret: existing.hmac_secret
    };
  }

  // ============================================================
  // SESIONES — CIERRE SELECTIVO
  // ============================================================

  // [RF-AUTH-02] | CA-02 | Cierre de sesión individual por ID (usado por RF-AUTH-03)
  // [RF-AUTH-03] | CA-02 | Cierra sesión individual que no sea la actual;
  // invalida en BD + revoca JTI en RefreshTokenStore + blacklist en Redis
  async closeSessionById(userId, sessionId, currentSessionId) {
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
  async closeOtherSessions(userId, currentSessionId) {
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
  async _closePreviousDeviceSessions(userId, deviceId) {
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
  async _enforceSessionLimit(userId) {
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

  /** @private */
  // [RF-AUTH-03] | CA-03 | Primer dispositivo del usuario → trusted automático,
  // sin notificación (es el dispositivo de registro inicial)
  async _registerFirstDevice(user, fingerprintHash, ip, enriched) {
    const { browser, os, deviceType, city, country, countryCode, deviceName } = enriched;

    const device = await this.trustedDeviceRepository.create({
      user_id: user.user_id,
      fingerprint_hash: fingerprintHash,
      device_name: deviceName,
      status: 'trusted',
      ip_address: ip,
      browser,
      os,
      device_type: deviceType,
      city,
      country,
      country_code: countryCode,
      trusted_at: new Date(),
      last_seen_at: new Date()
    });

    logAudit(
      'TRUSTED_DEVICE_ADDED_FIRST',
      user.user_id,
      { deviceName },
      { entityId: user.user_id, entityType: 'User', entityTable: 'users' }
    );

    return {
      requiresApproval: false,
      deviceId: device.user_trusted_device_id,
      deviceHmacSecret: device.hmac_secret
    };
  }

  // ============================================================
  // SMS MFA LOGIN CHALLENGE
  // ============================================================

  /** @private */
  async _issueSmsLoginChallenge(user, nationalId) {
    const userWithPhone = await this.userRepository.findById(user.user_id, {
      include: [
        {
          association: 'person',
          attributes: ['person_id'],
          include: [{ association: 'contact', attributes: ['phone_primary', 'phone_primary_prefix_id'] }]
        }
      ]
    });

    const phone = userWithPhone?.person?.contact?.phone_primary;
    if (!phone) {
      throw AppError.badRequest('No tienes número de teléfono registrado para SMS MFA');
    }
    const phonePrefixId = userWithPhone?.person?.contact?.phone_primary_prefix_id ?? null;

    const canRequest = await this.verificationCodeRepository.canRequestNewCode('phone', phone);
    if (!canRequest) {
      throw AppError.tooManyRequests('Debes esperar antes de solicitar un nuevo código SMS');
    }

    const code = this._generateSmsCode();
    const expiresAt = new Date(Date.now() + SMS_CHALLENGE_EXPIRY_MINUTES * 60 * 1000);

    const verificationCode = await this.verificationCodeRepository.create({
      type: 'phone',
      contact_value: phone,
      code,
      attempts: 0,
      expires_at: expiresAt
    });

    // SMS por AWS SNS — envío no bloqueante (no debe demorar/tumbar el flujo de login).
    setImmediate(async () => {
      try {
        const phoneNumber = await this.SmsService.resolveE164(phone, phonePrefixId);
        const result = await this.SmsService.enviarSmsOtp({
          phoneNumber,
          message: `Tu código de verificación es ${code}. Vence en ${SMS_CHALLENGE_EXPIRY_MINUTES} minutos.`,
          userId: user.user_id,
          purpose: 'mfa_login'
        });
        if (!result.success) {
          logger.warn('SMS login challenge no enviado', { userId: user.user_id, error: result.error });
        }
      } catch (err) {
        logger.warn('Error enviando SMS login challenge', { userId: user.user_id, error: err.message });
      }
    });

    logAudit(
      'MFA_REQUIRED',
      user.user_id,
      { nationalId, challengeType: 'SMS_OTP' },
      { entityId: user.user_id, entityType: 'User', entityTable: 'users' }
    );

    return MFARequiredResponseDTO({
      username: user.auth_username,
      session: verificationCode.verification_code_id,
      challengeType: 'SMS_OTP',
      preferredMfaMethod: 'sms'
    });
  }

  /** @private */
  async _verifySmsLoginChallenge(user, nationalId, code, { ip, userAgent, fingerprintHash }) {
    const userWithPhone = await this.userRepository.findById(user.user_id, {
      include: [
        {
          association: 'person',
          attributes: ['person_id'],
          include: [{ association: 'contact', attributes: ['phone_primary'] }]
        }
      ]
    });

    const phone = userWithPhone?.person?.contact?.phone_primary;
    if (!phone) {
      throw AppError.badRequest('No tienes número de teléfono registrado para SMS MFA');
    }

    const verificationCode = await this.verificationCodeRepository.findActiveByContact('phone', phone);
    if (!verificationCode || verificationCode.verified_at) {
      throw AppError.badRequest('Código SMS inválido o expirado');
    }

    if (verificationCode.attempts >= SMS_MAX_ATTEMPTS) {
      throw AppError.forbidden('Excediste el número máximo de intentos. Inicia sesión nuevamente');
    }

    if (verificationCode.code !== code) {
      await this.verificationCodeRepository.incrementAttempts(verificationCode.verification_code_id);

      await this.userLoginAttemptRepository.recordAttempt({
        user_id: user.user_id,
        username_attempt: user.auth_username,
        national_id: nationalId,
        ip_address: ip,
        user_agent: userAgent,
        device_fingerprint: fingerprintHash,
        success: false,
        failure_reason: 'Codigo SMS incorrecto',
        attempted_at: new Date()
      });

      // Evento forense de seguridad (Opción A): se mantiene pese al log genérico del
      // middleware al propagar el throw. El intento queda en user_login_attempts.
      logAudit(
        'MFA_FAILED',
        user.user_id,
        { nationalId, reason: 'Codigo SMS incorrecto' },
        { entityId: user.user_id, entityType: 'User', entityTable: 'users', outcome: 'failure' }
      );

      const remaining = SMS_MAX_ATTEMPTS - (verificationCode.attempts + 1);
      throw AppError.badRequest(`Código SMS incorrecto. Te quedan ${remaining} intento(s)`);
    }

    await this.verificationCodeRepository.markAsVerified(verificationCode.verification_code_id);
  }

  /** @private */
  _generateSmsCode() {
    if (MOCKS.EXTERNAL_PROVIDERS) {
      return '123456';
    }
    return String(crypto.randomInt(SMS_CODE_MIN, SMS_CODE_MAX + 1));
  }

  /** @private */
  // [RF-AUTH-03] | CA-03 | Segundo dispositivo en adelante → status pending +
  // dispara NUEVO_DISPOSITIVO_DETECTADO (fire-and-forget)
  async _registerPendingDevice(user, fingerprintHash, ip, enriched) {
    const { browser, os, deviceType, city, country, countryCode, deviceName } = enriched;

    const device = await this.trustedDeviceRepository.create({
      user_id: user.user_id,
      fingerprint_hash: fingerprintHash,
      device_name: deviceName,
      status: 'pending',
      ip_address: ip,
      browser,
      os,
      device_type: deviceType,
      city,
      country,
      country_code: countryCode,
      last_seen_at: new Date()
    });

    logAudit(
      'TRUSTED_DEVICE_PENDING',
      user.user_id,
      {
        deviceName
      },
      { entityId: device.user_trusted_device_id, entityType: 'UserTrustedDevice', entityTable: 'user_trusted_devices' }
    );

    // Notificación informativa (fire-and-forget — no bloquea el flujo)
    const firstName = user.person?.first_name || 'Usuario';
    const email = user.person?.contact?.email;

    this.NotificationUtil.crearNotificacion({
      tipoNotificacion: 'NUEVO_DISPOSITIVO_DETECTADO',
      userId: user.user_id,
      relatedEntity: null,
      metadata: {
        nombre: firstName,
        email,
        ip,
        browser: browser || 'Desconocido',
        os: os || 'Desconocido',
        ciudad: city || 'Desconocida',
        pais: country || 'Desconocido',
        deviceName,
        fechaAcceso: new Date().toISOString(),
        logoUrl: notifications.ses.logoUrl
      }
    }).catch(err => logger.warn('Error sending new device notification', { error: err.message }));

    return {
      requiresApproval: false,
      deviceId: device.user_trusted_device_id,
      deviceHmacSecret: device.hmac_secret
    };
  }
}


module.exports = new AuthLoginService();
module.exports.AuthLoginService = AuthLoginService;
