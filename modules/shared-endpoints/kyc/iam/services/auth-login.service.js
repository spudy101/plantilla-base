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
const TokenBlacklistUtil = require('../../../../../shared/utils/token-blacklist.util');
const NotificationUtil = require('../../../../schemas/notification/services/notification-creation.service');
const SmsService = require('../../../../schemas/notification/services/sms.service');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../shared/utils/logger.util');
const LoginRateLimiter = require('../../../../../shared/utils/login-rate-limiter.util');
const {
  LOGIN_RATE_LIMIT,
  server,
  CLIENT_ACCESS_ROLES,
  INTERNAL_ROLE_NAMES
} = require('../../../../../shared/constants');
const { LoginResponseDTO, MFARequiredResponseDTO } = require('../dtos/auth-login.dto');
const TokenRefreshService = require('./auth-login/token-refresh.service');
const AuthLogoutService = require('./auth-login/auth-logout.service');
const TrustedDeviceManagementService = require('./auth-login/trusted-device-management.service');
const SessionControlService = require('./auth-login/session-control.service');
const LoginDeviceService = require('./auth-login/login-device.service');
const SmsLoginChallengeService = require('./auth-login/sms-login-challenge.service');
const LoginPolicyGateService = require('./auth-login/login-policy-gate.service');
const SessionIssuerService = require('./auth-login/session-issuer.service');

// ============================================================
// CONSTANTES
// ============================================================

const IS_BYPASS_ENABLED = server.nodeEnv === 'development' && server.bypass === 'true';

// ============================================================
// AUTH LOGIN SERVICE — fachada
// ============================================================
// SOLID (S): este service tenía ~1600 líneas (login, MFA, refresh, logout,
// dispositivos y sesiones). Ahora el flujo de login vive aquí y el resto en
// servicios con una sola responsabilidad (carpeta auth-login/):
//   - TokenRefreshService             → rotación de refresh tokens
//   - AuthLogoutService               → logout / logoutAll
//   - TrustedDeviceManagementService  → gestión de dispositivos por el usuario
//   - SessionControlService           → cierre selectivo y límite de sesiones
//   - LoginDeviceService              → resolución del dispositivo en el login
//   - SmsLoginChallengeService        → desafío MFA por SMS
//   - LoginPolicyGateService          → política de privacidad al iniciar sesión (también biométrico)
//   - SessionIssuerService            → emisión de tokens + sesión (también biométrico y registro)
// La API pública no cambia: los métodos movidos se delegan al final de la clase.
// ============================================================

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

    // Sub-servicios por responsabilidad (SOLID: S). Reciben las mismas dependencias.
    const shared = {
      userRepository: this.userRepository,
      userLoginAttemptRepository: this.userLoginAttemptRepository,
      verificationCodeRepository: this.verificationCodeRepository,
      userSessionRepository: this.userSessionRepository,
      trustedDeviceRepository: this.trustedDeviceRepository,
      privacyPolicyRepository: this.privacyPolicyRepository,
      consentRecorder: this.consentRecorder,
      NotificationUtil: this.NotificationUtil,
      SmsService: this.SmsService
    };
    this.tokenRefresh = deps.tokenRefresh ?? new TokenRefreshService(shared);
    this.logoutService = deps.logoutService ?? new AuthLogoutService(shared);
    this.trustedDevices = deps.trustedDevices ?? new TrustedDeviceManagementService(shared);
    this.sessionControl = deps.sessionControl ?? new SessionControlService(shared);
    this.loginDevices = deps.loginDevices ?? new LoginDeviceService(shared);
    this.smsChallenge = deps.smsChallenge ?? new SmsLoginChallengeService(shared);
    this.policyGate = deps.policyGate ?? new LoginPolicyGateService(shared);
    this.sessionIssuer = deps.sessionIssuer ?? new SessionIssuerService(shared);
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
      return this.smsChallenge.issue(user, nationalId);
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
      await this.smsChallenge.verify(user, nationalId, smsCode || totpCode, {
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
  _checkPrivacyPolicy(user, acceptPolicy, ip) {
    return this.policyGate.check(user, acceptPolicy, ip, {
      blockedAuditAction: 'LOGIN_BLOCKED_POLICY_UPDATE',
      source: 'auth-login'
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
    const deviceResult = await this.loginDevices.handleTrustedDevice(user, auditContext);

    // ── Una sesión por dispositivo + límite de sesiones simultáneas ──────────────
    // Cerrar la previa ANTES de contar el tope: una sesión abandonada del mismo
    // dispositivo no debe consumir cupo de los 5 ni empujar al cierre una sesión
    // real en otro dispositivo. Mismo orden que el login biométrico.
    await this.sessionControl.closePreviousDeviceSessions(user.user_id, deviceResult.deviceId);
    await this.sessionControl.enforceSessionLimit(user.user_id);

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

    // ── Emitir tokens RS256 propios + sesión activa ──────────────────────────────
    const { sessionId, tokens } = await this.sessionIssuer.issue(user, {
      deviceId: deviceResult.deviceId,
      ip,
      userAgent,
      source: 'login'
    });

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

  // ============================================================
  // DELEGACIÓN (API pública estable para controllers y tests)
  // ============================================================
  // ── REFRESH TOKEN → TokenRefreshService ──

  refreshToken(refreshTokenStr) {
    return this.tokenRefresh.refreshToken(refreshTokenStr);
  }

  // ── LOGOUT → AuthLogoutService ──

  logout(userId, fingerprintHash, tokens = {}) {
    return this.logoutService.logout(userId, fingerprintHash, tokens);
  }

  logoutAll(userId, tokens = {}) {
    return this.logoutService.logoutAll(userId, tokens);
  }

  // ── TRUSTED DEVICES → TrustedDeviceManagementService ──

  getTrustedDevices(userId, currentFingerprintHash, currentSessionId = null) {
    return this.trustedDevices.getTrustedDevices(userId, currentFingerprintHash, currentSessionId);
  }

  getPendingDevices(userId) {
    return this.trustedDevices.getPendingDevices(userId);
  }

  renameDevice(userId, deviceId, deviceName) {
    return this.trustedDevices.renameDevice(userId, deviceId, deviceName);
  }

  blockDevice(userId, deviceId, currentFingerprintHash) {
    return this.trustedDevices.blockDevice(userId, deviceId, currentFingerprintHash);
  }

  unblockDevice(userId, deviceId, currentFingerprintHash) {
    return this.trustedDevices.unblockDevice(userId, deviceId, currentFingerprintHash);
  }

  approveDevice(userId, deviceId, currentFingerprintHash) {
    return this.trustedDevices.approveDevice(userId, deviceId, currentFingerprintHash);
  }

  // ── SESIONES → SessionControlService ──

  closeSessionById(userId, sessionId, currentSessionId) {
    return this.sessionControl.closeSessionById(userId, sessionId, currentSessionId);
  }

  closeOtherSessions(userId, currentSessionId) {
    return this.sessionControl.closeOtherSessions(userId, currentSessionId);
  }
}

module.exports = new AuthLoginService();
module.exports.AuthLoginService = AuthLoginService;
