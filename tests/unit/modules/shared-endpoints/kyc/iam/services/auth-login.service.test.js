// tests/unit/modules/shared-endpoints/kyc/iam/services/auth-login.service.test.js
//
// AuthLoginService — orquestador del login/MFA/sesiones/dispositivos de confianza. Es un service
// grande (~1637 líneas): aquí cubrimos sus RAMAS PRINCIPALES aislando por completo el acceso a datos
// y la criptografía. Se prueban:
//   - login(): bloqueo de cuenta (429), credenciales inválidas (404/400), password incorrecta (400/429),
//     política de privacidad desactualizada, reto TOTP, reto SMS y camino feliz sin MFA.
//   - verifyMFA(): TOTP válido/ inválido y verificación por SMS.
//   - refreshToken(): ventana de gracia, blacklist, invalidación global, reuse attack y rotación feliz.
//   - logout()/logoutAll(): blacklist + cierre de sesiones + auditoría.
//   - Trusted devices: getTrustedDevices/getPendingDevices/renameDevice/blockDevice/unblockDevice/approveDevice.
//   - closeSessionById()/closeOtherSessions().
//
// Se usa el AppError REAL para assertar statusCode. Los DTOs se hacen passthrough para no acoplar a su
// forma. Los envíos de SMS y notificaciones diferidos en setImmediate se drenan con `flush`
// (helper de cuerpo de bloque por la regla eslint no-promise-executor-return).

// ── Repositorios ────────────────────────────────────────────────────────────
jest.mock('modules/schemas/kyc/iam/repositories/user.repository', () => ({
  verifyPassword: jest.fn(),
  findByUsernameAndNationalId: jest.fn(),
  findById: jest.fn(),
  updatePrivacyPolicy: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/records/audit/repositories/user-login-attempt.repository', () => ({
  recordAttempt: jest.fn().mockResolvedValue(undefined),
  checkIfBlocked: jest.fn()
}));

jest.mock('modules/schemas/notification/repositories/verification-code.repository', () => ({
  canRequestNewCode: jest.fn(),
  create: jest.fn(),
  findActiveByContact: jest.fn(),
  incrementAttempts: jest.fn().mockResolvedValue(undefined),
  markAsVerified: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/kyc/iam/repositories/user-session.repository', () => ({
  create: jest.fn().mockResolvedValue(undefined),
  updateJtiAndLastAccess: jest.fn().mockResolvedValue(undefined),
  findById: jest.fn(),
  closeSession: jest.fn().mockResolvedValue(undefined),
  closeAllByUser: jest.fn().mockResolvedValue(undefined),
  findActiveByUserExcept: jest.fn(),
  closeAllByUserExcept: jest.fn().mockResolvedValue(undefined),
  findActiveByUserAndDevice: jest.fn(),
  countActive: jest.fn(),
  findOldestActive: jest.fn()
}));

jest.mock('modules/schemas/kyc/iam/repositories/auth-trusted-device.repository', () => ({
  updateLastSeen: jest.fn().mockResolvedValue(undefined),
  deleteAllByUser: jest.fn().mockResolvedValue(undefined),
  findAllByUserWithSessions: jest.fn(),
  findAllPending: jest.fn(),
  findByIdAndUser: jest.fn(),
  rename: jest.fn(),
  findByFingerprint: jest.fn(),
  block: jest.fn(),
  unblock: jest.fn(),
  approve: jest.fn(),
  countTrusted: jest.fn(),
  create: jest.fn()
}));

jest.mock('modules/schemas/records/legal/repositories/privacy-policy.repository', () => ({
  findActive: jest.fn()
}));

jest.mock('modules/schemas/records/legal/repositories/user-consent.repository', () => ({
  grant: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/records/legal/repositories/consent-type.repository', () => ({
  findByCode: jest.fn().mockResolvedValue(null)
}));

// ── Utils cripto / tokens ────────────────────────────────────────────────────
jest.mock('shared/utils/jwt.util', () => ({
  generateMfaChallengeToken: jest.fn().mockResolvedValue('challenge-token'),
  verifyMfaChallengeToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
  generateAccessToken: jest.fn().mockResolvedValue('access-token'),
  generateRefreshToken: jest.fn().mockResolvedValue('refresh-token')
}));

jest.mock('shared/utils/totp.util', () => ({
  verify: jest.fn()
}));

jest.mock('shared/utils/encryption.util', () => ({
  decrypt: jest.fn().mockReturnValue('totp-secret')
}));

jest.mock('shared/utils/refresh-token-store.util', () => ({
  getRotation: jest.fn(),
  exists: jest.fn(),
  revoke: jest.fn().mockResolvedValue(undefined),
  save: jest.fn(),
  saveRotation: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('shared/utils/device-fingerprint.util', () => ({
  enrichDevice: jest.fn().mockReturnValue({
    browser: 'Chrome',
    os: 'Windows',
    deviceType: 'desktop',
    city: 'Santiago',
    country: 'Chile',
    countryCode: 'CL',
    deviceName: 'Chrome en Windows'
  })
}));

jest.mock('shared/utils/device-blocklist.util', () => ({
  block: jest.fn().mockResolvedValue(undefined),
  unblock: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('shared/utils/token-blacklist.util', () => ({
  isRefreshTokenBlacklisted: jest.fn(),
  isUserSessionsInvalidated: jest.fn(),
  blacklistRefreshToken: jest.fn().mockResolvedValue(undefined),
  invalidateSessionTokensOnRotation: jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
  blacklistAccessToken: jest.fn().mockResolvedValue(undefined),
  blacklistSession: jest.fn().mockResolvedValue(undefined),
  clearUserInvalidation: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('shared/utils/redis.util', () => ({
  isAvailable: jest.fn().mockReturnValue(true)
}));

jest.mock('shared/utils/login-rate-limiter.util', () => ({
  checkAccountBlock: jest.fn(),
  incrementAccountFailures: jest.fn(),
  resetAccountCounters: jest.fn().mockResolvedValue(undefined)
}));

// ── Notificaciones / SMS ─────────────────────────────────────────────────────
jest.mock('modules/schemas/notification/services/notification-creation.service', () => ({
  crearNotificacion: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/notification/services/sms.service', () => ({
  resolveE164: jest.fn().mockResolvedValue('+56911112222'),
  enviarSmsOtp: jest.fn().mockResolvedValue({ success: true })
}));

// ── Logger ───────────────────────────────────────────────────────────────────
jest.mock('shared/utils/logger.util', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logAudit: jest.fn()
}));

// ── Constantes (el módulo real valida .env y hace process.exit) ──────────────
jest.mock('shared/constants', () => ({
  LOGIN_RATE_LIMIT: { ACCOUNT_MAX_ATTEMPTS: 5 },
  SECURITY: {
    ABSOLUTE_SESSION_LIFETIME_HOURS: 8,
    MAX_ACTIVE_SESSIONS: 5,
    REFRESH_ROTATION_GRACE_SECONDS: 60
  },
  AUTH_ERROR_CODES: {
    SESSION_CLOSED: 'SESSION_CLOSED',
    SESSION_COMPROMISED: 'SESSION_COMPROMISED',
    SESSION_ABSOLUTE_LIFETIME: 'SESSION_ABSOLUTE_LIFETIME'
  },
  server: { nodeEnv: 'test', bypass: 'false' },
  notifications: { ses: { logoUrl: 'http://logo' } },
  CLIENT_ACCESS_ROLES: ['CLIENTE'],
  INTERNAL_ROLE_NAMES: ['SUPERADMIN', 'ADMIN', 'AUDITOR'],
  MOCKS: { EXTERNAL_PROVIDERS: false },
  jwt: { accessTokenExpiry: 3600 },
  CONSENT_TYPE_CODES: { PRIVACY_POLICY: 'PRIVACY_POLICY' }
}));

// ── DTOs passthrough ─────────────────────────────────────────────────────────
jest.mock('modules/shared-endpoints/kyc/iam/dtos/auth-login.dto', () => ({
  LoginResponseDTO: arg => ({ __dto: 'login', ...arg }),
  PolicyUpdateRequiredDTO: arg => ({ __dto: 'policy', ...arg }),
  MFARequiredResponseDTO: arg => ({ __dto: 'mfa', ...arg }),
  TrustedDeviceListDTO: (devices, fh, sid) => ({ devices, total: devices.length, fh, sid }),
  TrustedDeviceUpdateDTO: device => ({
    userTrustedDeviceId: device.user_trusted_device_id,
    deviceName: device.device_name,
    status: device.status,
    updatedAt: device.updatedAt
  })
}));

// ── requires DESPUÉS de los mocks ────────────────────────────────────────────
const userRepository = require('modules/schemas/kyc/iam/repositories/user.repository');
const userLoginAttemptRepository = require('modules/schemas/records/audit/repositories/user-login-attempt.repository');
const verificationCodeRepository = require('modules/schemas/notification/repositories/verification-code.repository');
const userSessionRepository = require('modules/schemas/kyc/iam/repositories/user-session.repository');
const trustedDeviceRepository = require('modules/schemas/kyc/iam/repositories/auth-trusted-device.repository');
const privacyPolicyRepository = require('modules/schemas/records/legal/repositories/privacy-policy.repository');
const JwtUtil = require('shared/utils/jwt.util');
const TotpUtil = require('shared/utils/totp.util');
const RefreshTokenStore = require('shared/utils/refresh-token-store.util');
const DeviceBlocklistUtil = require('shared/utils/device-blocklist.util');
const TokenBlacklistUtil = require('shared/utils/token-blacklist.util');
const redisClient = require('shared/utils/redis.util');
const NotificationUtil = require('modules/schemas/notification/services/notification-creation.service');
const SmsService = require('modules/schemas/notification/services/sms.service');
const LoginRateLimiter = require('shared/utils/login-rate-limiter.util');
const { logAudit } = require('shared/utils/logger.util');

const service = require('modules/shared-endpoints/kyc/iam/services/auth-login.service');

// ── Helpers ──────────────────────────────────────────────────────────────────
const flush = () => new Promise(resolve => { setImmediate(resolve); });

const AUDIT = { ip: '1.2.3.4', userAgent: 'jest', fingerprintHash: 'fp-1' };

function makeUser(overrides = {}) {
  return {
    user_id: 'u-1',
    auth_username: 'juan',
    is_active: true,
    password_hash: 'hash',
    preferred_mfa_method: 'none',
    privacy_policy_version: null,
    totp_secret: 'enc-secret',
    role: { name: 'CLIENTE' },
    person: { first_name: 'Juan', contact: { email: 'j@x.cl' } },
    ...overrides
  };
}

function trustedDevice(overrides = {}) {
  return {
    user_trusted_device_id: 'dev-1',
    status: 'trusted',
    hmac_secret: 'hmac-1',
    fingerprint_hash: 'fp-1',
    device_name: 'Chrome',
    ...overrides
  };
}

describe('AuthLoginService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Defaults del camino feliz (se sobrescriben por test cuando aplica).
    LoginRateLimiter.checkAccountBlock.mockResolvedValue(null);
    LoginRateLimiter.incrementAccountFailures.mockResolvedValue(null);
    LoginRateLimiter.resetAccountCounters.mockResolvedValue(undefined);
    userLoginAttemptRepository.checkIfBlocked.mockResolvedValue(null);
    userLoginAttemptRepository.recordAttempt.mockResolvedValue(undefined);
    userRepository.findByUsernameAndNationalId.mockResolvedValue(makeUser());
    userRepository.findById.mockResolvedValue(makeUser());
    userRepository.verifyPassword.mockResolvedValue(true);
    privacyPolicyRepository.findActive.mockResolvedValue(null);
    trustedDeviceRepository.findByFingerprint.mockResolvedValue(trustedDevice());
    trustedDeviceRepository.updateLastSeen.mockResolvedValue(undefined);
    userSessionRepository.findActiveByUserAndDevice.mockResolvedValue([]);
    userSessionRepository.countActive.mockResolvedValue(0);
    userSessionRepository.create.mockResolvedValue(undefined);
    RefreshTokenStore.save.mockResolvedValue(true);
    TokenBlacklistUtil.clearUserInvalidation.mockResolvedValue(undefined);
  });

  // ============================================================
  // LOGIN
  // ============================================================
  describe('login', () => {
    it('lanza 429 si la cuenta está bloqueada en Redis', async () => {
      LoginRateLimiter.checkAccountBlock.mockResolvedValue(120);
      await expect(service.login({ nationalId: '111', password: 'pw' }, AUDIT)).rejects.toMatchObject({
        statusCode: 429
      });
    });

    it('lanza 400 (credenciales inválidas) si el usuario no existe', async () => {
      userRepository.findByUsernameAndNationalId.mockResolvedValue(null);
      await expect(service.login({ nationalId: '111', password: 'pw' }, AUDIT)).rejects.toMatchObject({
        statusCode: 400
      });
    });

    it('lanza 403 si la cuenta está inactiva', async () => {
      userRepository.findByUsernameAndNationalId.mockResolvedValue(makeUser({ is_active: false }));
      await expect(service.login({ nationalId: '111', password: 'pw' }, AUDIT)).rejects.toMatchObject({
        statusCode: 403
      });
    });

    it('lanza 403 si el rol no tiene acceso al portal (serverContext)', async () => {
      const audit = { ...AUDIT, serverContext: 'admin' }; // CLIENTE no accede al portal admin
      await expect(service.login({ nationalId: '111', password: 'pw' }, audit)).rejects.toMatchObject({
        statusCode: 403
      });
    });

    it('con password incorrecta registra el intento y lanza 400', async () => {
      userRepository.verifyPassword.mockResolvedValue(false);
      LoginRateLimiter.incrementAccountFailures.mockResolvedValue(null);

      await expect(service.login({ nationalId: '111', password: 'bad' }, AUDIT)).rejects.toMatchObject({
        statusCode: 400
      });
      expect(userLoginAttemptRepository.recordAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
      expect(logAudit).toHaveBeenCalledWith('LOGIN_FAILED', 'u-1', expect.any(Object), expect.any(Object));
    });

    it('con password incorrecta que supera el tope lanza 429 y notifica el bloqueo', async () => {
      userRepository.verifyPassword.mockResolvedValue(false);
      LoginRateLimiter.incrementAccountFailures.mockResolvedValue(600);

      await expect(service.login({ nationalId: '111', password: 'bad' }, AUDIT)).rejects.toMatchObject({
        statusCode: 429
      });
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'ACCOUNT_BLOCKED' })
      );
      expect(logAudit).toHaveBeenCalledWith('ACCOUNT_BLOCKED', 'u-1', expect.any(Object), expect.any(Object));
    });

    it('devuelve PolicyUpdateRequiredDTO si la política está desactualizada y no se aceptó', async () => {
      privacyPolicyRepository.findActive.mockResolvedValue({
        version: 'v2',
        document_url: 'http://p',
        summary: 's',
        effective_date: '2026-01-01'
      });
      userRepository.findByUsernameAndNationalId.mockResolvedValue(
        makeUser({ privacy_policy_version: 'v1' })
      );

      const result = await service.login({ nationalId: '111', password: 'pw' }, AUDIT);
      expect(result).toMatchObject({ __dto: 'policy', newVersion: 'v2' });
      // No debe validar la contraseña: el flujo corta antes.
      expect(userRepository.verifyPassword).not.toHaveBeenCalled();
    });

    it('emite reto TOTP (MFARequiredResponseDTO) si el usuario prefiere totp', async () => {
      userRepository.findByUsernameAndNationalId.mockResolvedValue(
        makeUser({ preferred_mfa_method: 'totp' })
      );

      const result = await service.login({ nationalId: '111', password: 'pw' }, AUDIT);
      expect(result).toMatchObject({
        __dto: 'mfa',
        challengeType: 'SOFTWARE_TOKEN_MFA',
        session: 'challenge-token',
        preferredMfaMethod: 'totp'
      });
      expect(JwtUtil.generateMfaChallengeToken).toHaveBeenCalledWith('u-1');
    });

    it('emite reto SMS y agenda el envío por SNS si el usuario prefiere sms', async () => {
      userRepository.findByUsernameAndNationalId.mockResolvedValue(
        makeUser({ preferred_mfa_method: 'sms' })
      );
      userRepository.findById.mockResolvedValue({
        person: { contact: { phone_primary: '911112222', phone_primary_prefix_id: 'pref-1' } }
      });
      verificationCodeRepository.canRequestNewCode.mockResolvedValue(true);
      verificationCodeRepository.create.mockResolvedValue({ verification_code_id: 'vc-1' });

      const result = await service.login({ nationalId: '111', password: 'pw' }, AUDIT);
      expect(result).toMatchObject({ __dto: 'mfa', challengeType: 'SMS_OTP', session: 'vc-1' });

      await flush();
      expect(SmsService.resolveE164).toHaveBeenCalledWith('911112222', 'pref-1');
      expect(SmsService.enviarSmsOtp).toHaveBeenCalledWith(
        expect.objectContaining({ purpose: 'mfa_login' })
      );
    });

    it('lanza 429 en el reto SMS si aún no puede pedir un nuevo código', async () => {
      userRepository.findByUsernameAndNationalId.mockResolvedValue(
        makeUser({ preferred_mfa_method: 'sms' })
      );
      userRepository.findById.mockResolvedValue({
        person: { contact: { phone_primary: '911112222', phone_primary_prefix_id: 'pref-1' } }
      });
      verificationCodeRepository.canRequestNewCode.mockResolvedValue(false);

      await expect(service.login({ nationalId: '111', password: 'pw' }, AUDIT)).rejects.toMatchObject({
        statusCode: 429
      });
    });

    it('camino feliz sin MFA: emite tokens, crea sesión y devuelve LoginResponseDTO', async () => {
      const result = await service.login({ nationalId: '111', password: 'pw' }, AUDIT);

      expect(result).toMatchObject({ __dto: 'login' });
      expect(result.tokens).toMatchObject({ accessToken: 'access-token', refreshToken: 'refresh-token' });
      expect(userSessionRepository.create).toHaveBeenCalled();
      expect(RefreshTokenStore.save).toHaveBeenCalled();
      expect(userLoginAttemptRepository.recordAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
      expect(logAudit).toHaveBeenCalledWith('LOGIN_SUCCESS', 'u-1', expect.any(Object), expect.any(Object));
    });

    it('lanza 403 si el dispositivo existente está bloqueado', async () => {
      trustedDeviceRepository.findByFingerprint.mockResolvedValue(trustedDevice({ status: 'blocked' }));
      await expect(service.login({ nationalId: '111', password: 'pw' }, AUDIT)).rejects.toMatchObject({
        statusCode: 403
      });
    });
  });

  // ============================================================
  // VERIFY MFA
  // ============================================================
  describe('verifyMFA', () => {
    it('con TOTP válido completa el login', async () => {
      userRepository.findByUsernameAndNationalId.mockResolvedValue(
        makeUser({ preferred_mfa_method: 'totp' })
      );
      JwtUtil.verifyMfaChallengeToken.mockResolvedValue({ userId: 'u-1' });
      TotpUtil.verify.mockReturnValue(true);

      const result = await service.verifyMFA(
        { nationalId: '111', totpCode: '123456', session: 'challenge-token' },
        AUDIT
      );
      expect(result).toMatchObject({ __dto: 'login' });
      expect(result.tokens.accessToken).toBe('access-token');
    });

    it('con TOTP inválido registra el intento y lanza 400', async () => {
      userRepository.findByUsernameAndNationalId.mockResolvedValue(
        makeUser({ preferred_mfa_method: 'totp' })
      );
      JwtUtil.verifyMfaChallengeToken.mockResolvedValue({ userId: 'u-1' });
      TotpUtil.verify.mockReturnValue(false);

      await expect(
        service.verifyMFA({ nationalId: '111', totpCode: '000000', session: 'challenge-token' }, AUDIT)
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(userLoginAttemptRepository.recordAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ failure_reason: 'Codigo TOTP incorrecto' })
      );
      expect(logAudit).toHaveBeenCalledWith('MFA_FAILED', 'u-1', expect.any(Object), expect.any(Object));
    });

    it('lanza 401 si falta el token de reto MFA (session)', async () => {
      userRepository.findByUsernameAndNationalId.mockResolvedValue(
        makeUser({ preferred_mfa_method: 'totp' })
      );
      await expect(
        service.verifyMFA({ nationalId: '111', totpCode: '123456' }, AUDIT)
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('con SMS correcto marca verificado y completa el login', async () => {
      userRepository.findByUsernameAndNationalId.mockResolvedValue(
        makeUser({ preferred_mfa_method: 'sms' })
      );
      userRepository.findById.mockResolvedValue({
        person: { contact: { phone_primary: '911112222' } }
      });
      verificationCodeRepository.findActiveByContact.mockResolvedValue({
        verification_code_id: 'vc-1',
        attempts: 0,
        code: '123456',
        verified_at: null
      });

      const result = await service.verifyMFA(
        { nationalId: '111', smsCode: '123456' },
        AUDIT
      );
      expect(verificationCodeRepository.markAsVerified).toHaveBeenCalledWith('vc-1');
      expect(result).toMatchObject({ __dto: 'login' });
    });

    it('con SMS incorrecto incrementa intentos y lanza 400', async () => {
      userRepository.findByUsernameAndNationalId.mockResolvedValue(
        makeUser({ preferred_mfa_method: 'sms' })
      );
      userRepository.findById.mockResolvedValue({
        person: { contact: { phone_primary: '911112222' } }
      });
      verificationCodeRepository.findActiveByContact.mockResolvedValue({
        verification_code_id: 'vc-1',
        attempts: 1,
        code: '123456',
        verified_at: null
      });

      await expect(
        service.verifyMFA({ nationalId: '111', smsCode: '000000' }, AUDIT)
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(verificationCodeRepository.incrementAttempts).toHaveBeenCalledWith('vc-1');
    });
  });

  // ============================================================
  // REFRESH TOKEN
  // ============================================================
  describe('refreshToken', () => {
    const DECODED = { jti: 'jti-1', userId: 'u-1', iat: 1000, sessionId: 'sess-1' };

    it('reusa el par emitido si el JTI está en la ventana de gracia', async () => {
      JwtUtil.verifyRefreshToken.mockResolvedValue(DECODED);
      RefreshTokenStore.getRotation.mockResolvedValue({
        accessToken: 'grace-a',
        refreshToken: 'grace-r',
        expiresIn: 3600
      });

      const result = await service.refreshToken('tok');
      expect(result).toMatchObject({ accessToken: 'grace-a', refreshToken: 'grace-r' });
      // Se corta temprano — no verifica blacklist.
      expect(TokenBlacklistUtil.isRefreshTokenBlacklisted).not.toHaveBeenCalled();
    });

    it('lanza 401 (SESSION_CLOSED) si el refresh token está en blacklist', async () => {
      JwtUtil.verifyRefreshToken.mockResolvedValue(DECODED);
      RefreshTokenStore.getRotation.mockResolvedValue(null);
      TokenBlacklistUtil.isRefreshTokenBlacklisted.mockResolvedValue(true);

      // BUG del fuente: AppError.unauthorized(message, details) NO acepta `code`, así que el
      // AUTH_ERROR_CODE viaja en `.details.code` y `.code` queda en 'UNAUTHORIZED'.
      await expect(service.refreshToken('tok')).rejects.toMatchObject({
        statusCode: 401,
        details: { code: 'SESSION_CLOSED' }
      });
    });

    it('detecta reuse attack e invalida todas las sesiones (401 SESSION_COMPROMISED)', async () => {
      JwtUtil.verifyRefreshToken.mockResolvedValue(DECODED);
      RefreshTokenStore.getRotation.mockResolvedValue(null);
      TokenBlacklistUtil.isRefreshTokenBlacklisted.mockResolvedValue(false);
      TokenBlacklistUtil.isUserSessionsInvalidated.mockResolvedValue(false);
      RefreshTokenStore.exists.mockResolvedValue(null); // JTI ausente
      redisClient.isAvailable.mockReturnValue(true);
      userSessionRepository.findById.mockResolvedValue({ status: 'active' });

      await expect(service.refreshToken('tok')).rejects.toMatchObject({
        statusCode: 401,
        details: { code: 'SESSION_COMPROMISED' }
      });
      expect(TokenBlacklistUtil.invalidateUserSessions).toHaveBeenCalledWith('u-1');
      expect(logAudit).toHaveBeenCalledWith(
        'REFRESH_TOKEN_REUSE_ATTACK',
        'u-1',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('rotación feliz: revoca el JTI viejo y emite tokens nuevos', async () => {
      JwtUtil.verifyRefreshToken.mockResolvedValue(DECODED);
      RefreshTokenStore.getRotation.mockResolvedValue(null);
      TokenBlacklistUtil.isRefreshTokenBlacklisted.mockResolvedValue(false);
      TokenBlacklistUtil.isUserSessionsInvalidated.mockResolvedValue(false);
      RefreshTokenStore.exists.mockResolvedValue('u-1');
      userRepository.findById.mockResolvedValue(makeUser());
      // Sesión activa dentro del tope absoluto.
      userSessionRepository.findById.mockResolvedValue({
        status: 'active',
        started_at: new Date().toISOString()
      });
      RefreshTokenStore.save.mockResolvedValue(true);

      const result = await service.refreshToken('tok');

      expect(RefreshTokenStore.revoke).toHaveBeenCalledWith('jti-1');
      expect(result).toMatchObject({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600
      });
      expect(logAudit).toHaveBeenCalledWith('TOKEN_REFRESHED', 'u-1', expect.any(Object), expect.any(Object));
    });

    it('lanza 401 si el usuario ya no existe o está inactivo', async () => {
      JwtUtil.verifyRefreshToken.mockResolvedValue(DECODED);
      RefreshTokenStore.getRotation.mockResolvedValue(null);
      TokenBlacklistUtil.isRefreshTokenBlacklisted.mockResolvedValue(false);
      TokenBlacklistUtil.isUserSessionsInvalidated.mockResolvedValue(false);
      RefreshTokenStore.exists.mockResolvedValue('u-1');
      userRepository.findById.mockResolvedValue(null);

      await expect(service.refreshToken('tok')).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  // ============================================================
  // LOGOUT
  // ============================================================
  describe('logout', () => {
    it('cierra la sesión, blacklistea tokens y audita LOGOUT', async () => {
      const result = await service.logout('u-1', 'fp-1', {
        accessToken: 'a',
        tokenExp: 999,
        refreshToken: 'r',
        sessionId: 'sess-1'
      });

      expect(userSessionRepository.closeSession).toHaveBeenCalledWith('sess-1', 'logout');
      expect(TokenBlacklistUtil.blacklistAccessToken).toHaveBeenCalledWith('a', 999);
      expect(TokenBlacklistUtil.blacklistRefreshToken).toHaveBeenCalledWith('r');
      expect(logAudit).toHaveBeenCalledWith('LOGOUT', 'u-1', expect.any(Object), expect.any(Object));
      expect(result).toBeNull();
    });
  });

  describe('logoutAll', () => {
    it('invalida todas las sesiones, las cierra en BD y notifica (setImmediate)', async () => {
      const result = await service.logoutAll('u-1', { accessToken: 'a', tokenExp: 999, firstName: 'Juan' });

      expect(TokenBlacklistUtil.invalidateUserSessions).toHaveBeenCalledWith('u-1');
      expect(userSessionRepository.closeAllByUser).toHaveBeenCalledWith('u-1', 'logout_all');
      expect(trustedDeviceRepository.deleteAllByUser).toHaveBeenCalledWith('u-1');
      expect(logAudit).toHaveBeenCalledWith('LOGOUT_ALL', 'u-1', expect.any(Object), expect.any(Object));
      expect(result).toBeNull();

      await flush();
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'LOGOUT_ALL' })
      );
    });
  });

  // ============================================================
  // TRUSTED DEVICES
  // ============================================================
  describe('getTrustedDevices / getPendingDevices', () => {
    it('lista dispositivos con sesiones y audita', async () => {
      trustedDeviceRepository.findAllByUserWithSessions.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const result = await service.getTrustedDevices('u-1', 'fp-1', 'sess-1');
      expect(result).toMatchObject({ total: 2 });
      expect(logAudit).toHaveBeenCalledWith('TRUSTED_DEVICES_VIEWED', 'u-1', expect.any(Object), expect.any(Object));
    });

    it('lista dispositivos pendientes y audita', async () => {
      trustedDeviceRepository.findAllPending.mockResolvedValue([{ id: 1 }]);
      const result = await service.getPendingDevices('u-1');
      expect(result).toMatchObject({ total: 1 });
      expect(logAudit).toHaveBeenCalledWith('PENDING_DEVICES_VIEWED', 'u-1', expect.any(Object), expect.any(Object));
    });
  });

  describe('renameDevice', () => {
    it('lanza 404 si el dispositivo no existe', async () => {
      trustedDeviceRepository.findByIdAndUser.mockResolvedValue(null);
      await expect(service.renameDevice('u-1', 'dev-1', 'Nuevo')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('renombra y audita', async () => {
      trustedDeviceRepository.findByIdAndUser.mockResolvedValue(trustedDevice());
      trustedDeviceRepository.rename.mockResolvedValue(trustedDevice({ device_name: 'Nuevo' }));
      const result = await service.renameDevice('u-1', 'dev-1', 'Nuevo');
      expect(result).toMatchObject({ deviceName: 'Nuevo' });
      expect(logAudit).toHaveBeenCalledWith('TRUSTED_DEVICE_RENAMED', 'u-1', expect.any(Object), expect.any(Object));
    });
  });

  describe('blockDevice', () => {
    it('lanza 403 si quien bloquea no es un dispositivo de confianza', async () => {
      trustedDeviceRepository.findByFingerprint.mockResolvedValue(trustedDevice({ status: 'pending' }));
      await expect(service.blockDevice('u-1', 'dev-2', 'fp-1')).rejects.toMatchObject({ statusCode: 403 });
    });

    it('lanza 400 si intentas bloquear tu propio dispositivo', async () => {
      trustedDeviceRepository.findByFingerprint.mockResolvedValue(trustedDevice({ user_trusted_device_id: 'dev-1' }));
      await expect(service.blockDevice('u-1', 'dev-1', 'fp-1')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('lanza 400 si es el único dispositivo de confianza', async () => {
      trustedDeviceRepository.findByFingerprint.mockResolvedValue(trustedDevice({ user_trusted_device_id: 'dev-1' }));
      trustedDeviceRepository.findByIdAndUser.mockResolvedValue(trustedDevice({ user_trusted_device_id: 'dev-2', status: 'trusted' }));
      trustedDeviceRepository.countTrusted.mockResolvedValue(1);
      await expect(service.blockDevice('u-1', 'dev-2', 'fp-1')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('bloquea, escribe la blocklist en Redis y audita', async () => {
      trustedDeviceRepository.findByFingerprint.mockResolvedValue(trustedDevice({ user_trusted_device_id: 'dev-1' }));
      trustedDeviceRepository.findByIdAndUser.mockResolvedValue(
        trustedDevice({ user_trusted_device_id: 'dev-2', status: 'pending', fingerprint_hash: 'fp-2' })
      );
      trustedDeviceRepository.block.mockResolvedValue(trustedDevice({ user_trusted_device_id: 'dev-2', status: 'blocked' }));

      const result = await service.blockDevice('u-1', 'dev-2', 'fp-1');
      expect(DeviceBlocklistUtil.block).toHaveBeenCalledWith('u-1', 'fp-2');
      expect(result).toMatchObject({ status: 'blocked' });
      expect(logAudit).toHaveBeenCalledWith('TRUSTED_DEVICE_BLOCKED', 'u-1', expect.any(Object), expect.any(Object));
    });
  });

  describe('unblockDevice', () => {
    it('lanza 400 si el dispositivo no está bloqueado', async () => {
      trustedDeviceRepository.findByFingerprint.mockResolvedValue(trustedDevice({ user_trusted_device_id: 'dev-1' }));
      trustedDeviceRepository.findByIdAndUser.mockResolvedValue(trustedDevice({ user_trusted_device_id: 'dev-2', status: 'pending' }));
      await expect(service.unblockDevice('u-1', 'dev-2', 'fp-1')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('desbloquea (→ pending), limpia Redis y audita', async () => {
      trustedDeviceRepository.findByFingerprint.mockResolvedValue(trustedDevice({ user_trusted_device_id: 'dev-1' }));
      trustedDeviceRepository.findByIdAndUser.mockResolvedValue(
        trustedDevice({ user_trusted_device_id: 'dev-2', status: 'blocked', fingerprint_hash: 'fp-2' })
      );
      trustedDeviceRepository.unblock.mockResolvedValue(trustedDevice({ user_trusted_device_id: 'dev-2', status: 'pending' }));

      const result = await service.unblockDevice('u-1', 'dev-2', 'fp-1');
      expect(DeviceBlocklistUtil.unblock).toHaveBeenCalledWith('u-1', 'fp-2');
      expect(result).toMatchObject({ status: 'pending' });
      expect(logAudit).toHaveBeenCalledWith('TRUSTED_DEVICE_UNBLOCKED', 'u-1', expect.any(Object), expect.any(Object));
    });
  });

  describe('approveDevice', () => {
    it('lanza 400 si el dispositivo no está pendiente', async () => {
      trustedDeviceRepository.findByFingerprint.mockResolvedValue(trustedDevice({ user_trusted_device_id: 'dev-1' }));
      trustedDeviceRepository.findByIdAndUser.mockResolvedValue(trustedDevice({ user_trusted_device_id: 'dev-2', status: 'trusted' }));
      await expect(service.approveDevice('u-1', 'dev-2', 'fp-1')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('aprueba (→ trusted) y audita', async () => {
      trustedDeviceRepository.findByFingerprint.mockResolvedValue(trustedDevice({ user_trusted_device_id: 'dev-1' }));
      trustedDeviceRepository.findByIdAndUser.mockResolvedValue(trustedDevice({ user_trusted_device_id: 'dev-2', status: 'pending' }));
      trustedDeviceRepository.approve.mockResolvedValue(trustedDevice({ user_trusted_device_id: 'dev-2', status: 'trusted' }));

      const result = await service.approveDevice('u-1', 'dev-2', 'fp-1');
      expect(result).toMatchObject({ status: 'trusted' });
      expect(logAudit).toHaveBeenCalledWith('TRUSTED_DEVICE_APPROVED', 'u-1', expect.any(Object), expect.any(Object));
    });
  });

  // ============================================================
  // CIERRE SELECTIVO DE SESIONES
  // ============================================================
  describe('closeSessionById', () => {
    it('lanza 400 si se intenta cerrar la sesión actual', async () => {
      await expect(service.closeSessionById('u-1', 'sess-1', 'sess-1')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('lanza 404 si la sesión no existe o no pertenece al usuario', async () => {
      userSessionRepository.findById.mockResolvedValue(null);
      await expect(service.closeSessionById('u-1', 'sess-2', 'sess-1')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('lanza 400 si la sesión ya está cerrada', async () => {
      userSessionRepository.findById.mockResolvedValue({ user_id: 'u-1', status: 'closed', jti: 'j' });
      await expect(service.closeSessionById('u-1', 'sess-2', 'sess-1')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('cierra la sesión, revoca el JTI y blacklistea', async () => {
      userSessionRepository.findById.mockResolvedValue({ user_id: 'u-1', status: 'active', jti: 'j-2' });
      const result = await service.closeSessionById('u-1', 'sess-2', 'sess-1');

      expect(userSessionRepository.closeSession).toHaveBeenCalledWith('sess-2', 'closed_by_user');
      expect(RefreshTokenStore.revoke).toHaveBeenCalledWith('j-2');
      expect(TokenBlacklistUtil.blacklistSession).toHaveBeenCalledWith('sess-2');
      expect(result).toMatchObject({ sessionId: 'sess-2', status: 'closed' });
    });
  });

  describe('closeOtherSessions', () => {
    it('devuelve closedCount 0 si no hay otras sesiones', async () => {
      userSessionRepository.findActiveByUserExcept.mockResolvedValue([]);
      const result = await service.closeOtherSessions('u-1', 'sess-1');
      expect(result).toMatchObject({ closedCount: 0 });
      expect(userSessionRepository.closeAllByUserExcept).not.toHaveBeenCalled();
    });

    it('cierra las demás sesiones, revoca cada JTI y devuelve el conteo', async () => {
      userSessionRepository.findActiveByUserExcept.mockResolvedValue([
        { user_session_id: 's-2', jti: 'j-2' },
        { user_session_id: 's-3', jti: 'j-3' }
      ]);
      const result = await service.closeOtherSessions('u-1', 'sess-1');

      expect(userSessionRepository.closeAllByUserExcept).toHaveBeenCalledWith('u-1', 'sess-1', 'logout_others');
      expect(RefreshTokenStore.revoke).toHaveBeenCalledWith('j-2');
      expect(RefreshTokenStore.revoke).toHaveBeenCalledWith('j-3');
      expect(result).toMatchObject({ closedCount: 2 });
    });
  });
});
