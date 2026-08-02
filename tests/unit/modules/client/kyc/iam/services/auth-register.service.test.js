// tests/unit/modules/client/kyc/iam/services/auth-register.service.test.js
//
// AuthRegisterService — registro público y reset de credenciales. Servicio grande: cubrimos las
// ramas principales de register() (prerrequisitos, validación de unicidad, creación transaccional,
// emisión de tokens, notificaciones best-effort), el bypass de desarrollo, y los flujos de
// requestResetCredentials() (anti-enumeración) y confirmResetCredentials() (password/mfa/guardas).
// Todo dependencia se mockea inline; crypto real; AppError real (autocontenido).

// setImmediate en cuerpo de bloque para evitar no-promise-executor-return.
const flush = () =>
  new Promise(resolve => {
    setImmediate(resolve);
  });

jest.mock('uuid', () => ({ v4: jest.fn(() => 'uuid-fijo') }));

jest.mock('modules/schemas/kyc/iam/repositories/user.repository', () => ({
  findByUserId: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updatePassword: jest.fn()
}));
jest.mock('modules/schemas/kyc/person/repositories/person.repository', () => ({
  findByNationalId: jest.fn(),
  create: jest.fn()
}));
jest.mock('modules/schemas/kyc/person/repositories/person-contact.repository', () => ({
  findByEmail: jest.fn(),
  create: jest.fn()
}));
jest.mock('modules/schemas/kyc/maintainers/repositories/document-type.repository', () => ({
  findById: jest.fn()
}));
jest.mock('modules/schemas/kyc/iam/repositories/reset-credentials.repository', () => ({
  invalidateUserTokens: jest.fn(),
  createResetToken: jest.fn(),
  findValidToken: jest.fn(),
  markAsUsed: jest.fn()
}));
jest.mock('modules/schemas/kyc/person/repositories/user-notification-preference.repository', () => ({
  create: jest.fn()
}));
jest.mock('modules/schemas/kyc/maintainers/repositories/country.repository', () => ({
  findByCode: jest.fn()
}));
jest.mock('modules/schemas/records/legal/repositories/privacy-policy.repository', () => ({
  findActive: jest.fn()
}));
jest.mock('modules/schemas/records/legal/repositories/user-consent.repository', () => ({
  grant: jest.fn()
}));
jest.mock('modules/schemas/records/legal/repositories/consent-type.repository', () => ({
  findByCode: jest.fn()
}));
jest.mock('modules/schemas/kyc/maintainers/repositories/gender.repository', () => ({
  exists: jest.fn()
}));
jest.mock('modules/schemas/notification/repositories/verification-code.repository', () => ({
  findVerifiedByContact: jest.fn(),
  deleteVerifiedByContact: jest.fn()
}));
jest.mock('modules/schemas/kyc/iam/repositories/role.repository', () => ({
  findByName: jest.fn()
}));
jest.mock('modules/schemas/kyc/iam/repositories/user-session.repository', () => ({
  create: jest.fn(),
  closeAllByUser: jest.fn()
}));

jest.mock('shared/utils/jwt.util', () => ({
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn()
}));
jest.mock('shared/utils/refresh-token-store.util', () => ({
  save: jest.fn()
}));
jest.mock('modules/schemas/kyc/person/utils/kyc-shared.util', () => ({
  logChange: jest.fn()
}));
jest.mock('shared/utils/token-blacklist.util', () => ({
  invalidateUserSessions: jest.fn()
}));
jest.mock('modules/schemas/notification/services/notification-creation.service', () => ({
  crearNotificacion: jest.fn(),
  crearNotificacionDirecta: jest.fn()
}));
jest.mock('shared/utils/request-context.util', () => ({
  originFromContext: jest.fn(() => ({}))
}));
jest.mock('shared/models', () => ({
  sequelize: { transaction: jest.fn() }
}));
jest.mock('modules/client/kyc/iam/dtos/auth-register.dto', () => ({
  RegisterResponseDTO: jest.fn(x => ({ dto: true, userId: x.user?.user_id, tokens: x.tokens }))
}));

jest.mock('shared/utils/logger.util', () => ({
  logAudit: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

// mockConstants es la MISMA referencia devuelta por la factory (permite mutar server para el
// test de bypass y que un require aislado lo lea).
const mockConstants = {
  CONSENT_TYPE_CODES: { PRIVACY_POLICY: 'PRIVACY_POLICY', COMUNICACIONES_COMERCIALES: 'COMUNICACIONES_COMERCIALES' },
  frontend: { resetCredentialUrl: 'https://front/reset' },
  SECURITY: { RESET_TOKEN_EXPIRATION_MINUTES: 15 },
  RBAC_ROLES: { CLIENTE: 'CLIENTE' },
  server: { nodeEnv: 'test', bypass: 'false' },
  notifications: { ses: { logoUrl: 'https://logo' } },
  jwt: { accessTokenExpiry: '15m' }
};
jest.mock('shared/constants', () => mockConstants);

const userRepository = require('modules/schemas/kyc/iam/repositories/user.repository');
const personRepository = require('modules/schemas/kyc/person/repositories/person.repository');
const personContactRepository = require('modules/schemas/kyc/person/repositories/person-contact.repository');
const documentTypeRepository = require('modules/schemas/kyc/maintainers/repositories/document-type.repository');
const resetCredentialsRepository = require('modules/schemas/kyc/iam/repositories/reset-credentials.repository');
const userNotificationPreferenceRepository = require('modules/schemas/kyc/person/repositories/user-notification-preference.repository');
const countryRepository = require('modules/schemas/kyc/maintainers/repositories/country.repository');
const privacyPolicyRepository = require('modules/schemas/records/legal/repositories/privacy-policy.repository');
const userConsentRepository = require('modules/schemas/records/legal/repositories/user-consent.repository');
const consentTypeRepository = require('modules/schemas/records/legal/repositories/consent-type.repository');
const genderRepository = require('modules/schemas/kyc/maintainers/repositories/gender.repository');
const verificationCodeRepository = require('modules/schemas/notification/repositories/verification-code.repository');
const roleRepository = require('modules/schemas/kyc/iam/repositories/role.repository');
const userSessionRepository = require('modules/schemas/kyc/iam/repositories/user-session.repository');
const JwtUtil = require('shared/utils/jwt.util');
const RefreshTokenStore = require('shared/utils/refresh-token-store.util');
const KycSharedUtil = require('modules/schemas/kyc/person/utils/kyc-shared.util');
const TokenBlacklistUtil = require('shared/utils/token-blacklist.util');
const NotificationUtil = require('modules/schemas/notification/services/notification-creation.service');
const { sequelize } = require('shared/models');
const { logAudit } = require('shared/utils/logger.util');

const service = require('modules/client/kyc/iam/services/auth-register.service');

const VALID_USER_DATA = {
  email: 'nuevo@x.com',
  password: 'Secret123!',
  firstName: 'Ada',
  middleName: null,
  lastName: 'Lovelace',
  secondLastName: null,
  nationalId: '12345678',
  documentTypeId: 'dt-1',
  genderId: null,
  birthDate: '1990-01-01',
  comunicacionesComerciales: false
};

// Configura todas las dependencias para un register() por el camino feliz.
function armHappyRegister() {
  countryRepository.findByCode.mockResolvedValue({ country_id: 'co-1' });
  privacyPolicyRepository.findActive.mockResolvedValue({ version: 'v1', privacy_policy_id: 'pp-1' });
  verificationCodeRepository.findVerifiedByContact.mockResolvedValue({ verified: true });
  verificationCodeRepository.deleteVerifiedByContact.mockResolvedValue(undefined);
  documentTypeRepository.findById.mockResolvedValue({ document_type_id: 'dt-1', is_active: true, is_visible_to_client: true });
  personContactRepository.findByEmail.mockResolvedValue(null);
  personRepository.findByNationalId.mockResolvedValue(null);

  sequelize.transaction.mockResolvedValue({
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined)
  });
  roleRepository.findByName.mockResolvedValue({ role_id: 'role-cliente' });
  personRepository.create.mockResolvedValue({ person_id: 'p-1' });
  personContactRepository.create.mockResolvedValue({ person_contact_id: 'pc-1' });
  userRepository.create.mockResolvedValue({ user_id: 'u-1' });
  userNotificationPreferenceRepository.create.mockResolvedValue({});
  consentTypeRepository.findByCode.mockResolvedValue({ consent_type_id: 'ct-1' });
  userConsentRepository.grant.mockResolvedValue({ user_consent_id: 'uc-1' });

  userRepository.findByUserId.mockResolvedValue({ user_id: 'u-1', role: {}, person: {} });
  JwtUtil.generateAccessToken.mockResolvedValue('access-tok');
  JwtUtil.generateRefreshToken.mockResolvedValue('refresh-tok');
  RefreshTokenStore.save.mockResolvedValue(true);
  userSessionRepository.create.mockResolvedValue({});
  NotificationUtil.crearNotificacion.mockResolvedValue(undefined);
}

describe('AuthRegisterService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConstants.server.nodeEnv = 'test';
    mockConstants.server.bypass = 'false';
  });

  describe('register — bypass de desarrollo', () => {
    it('lanza badRequest cuando el bypass está habilitado (dev + bypass=true)', async () => {
      // El flag IS_BYPASS_ENABLED se evalúa al cargar el módulo → re-require aislado con constants mutadas.
      mockConstants.server.nodeEnv = 'development';
      mockConstants.server.bypass = 'true';
      let bypassSvc;
      jest.isolateModules(() => {
        bypassSvc = require('modules/client/kyc/iam/services/auth-register.service');
      });

      await expect(bypassSvc.register(VALID_USER_DATA, {})).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('register — camino feliz', () => {
    it('crea el usuario, emite tokens, audita y devuelve el DTO de respuesta', async () => {
      armHappyRegister();

      const result = await service.register(VALID_USER_DATA, { ip: '9.9.9.9', userAgent: 'jest' });

      expect(personRepository.create).toHaveBeenCalled();
      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ auth_username: 'user_uuid-fijo', person_id: 'p-1', role_id: 'role-cliente' }),
        expect.any(Object)
      );
      expect(userConsentRepository.grant).toHaveBeenCalledTimes(1); // solo privacy policy (comunicaciones=false)
      expect(JwtUtil.generateAccessToken).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith('USER_REGISTERED', 'u-1', expect.any(Object), expect.any(Object));
      expect(result).toMatchObject({ dto: true, userId: 'u-1', tokens: { accessToken: 'access-tok', refreshToken: 'refresh-tok', expiresIn: '15m' } });

      await flush();
      expect(verificationCodeRepository.deleteVerifiedByContact).toHaveBeenCalledWith('email', VALID_USER_DATA.email);
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'BIENVENIDA', userId: 'u-1' })
      );
    });

    it('registra también el consentimiento de comunicaciones comerciales cuando se acepta', async () => {
      armHappyRegister();
      await service.register({ ...VALID_USER_DATA, comunicacionesComerciales: true }, {});
      expect(userConsentRepository.grant).toHaveBeenCalledTimes(2);
    });

    it('valida el género cuando se envía genderId', async () => {
      armHappyRegister();
      genderRepository.exists.mockResolvedValue(true);
      await service.register({ ...VALID_USER_DATA, genderId: 'g-1' }, {});
      expect(genderRepository.exists).toHaveBeenCalledWith({ gender_id: 'g-1' });
    });
  });

  describe('register — prerrequisitos', () => {
    it('lanza internal si no hay política de privacidad activa', async () => {
      armHappyRegister();
      privacyPolicyRepository.findActive.mockResolvedValue(null);
      await expect(service.register(VALID_USER_DATA, {})).rejects.toMatchObject({ statusCode: 500 });
    });

    it('lanza internal si el país de operación no está configurado', async () => {
      armHappyRegister();
      countryRepository.findByCode.mockResolvedValue(null);
      await expect(service.register(VALID_USER_DATA, {})).rejects.toMatchObject({ statusCode: 500 });
    });

    it('lanza forbidden si el email no está verificado', async () => {
      armHappyRegister();
      verificationCodeRepository.findVerifiedByContact.mockResolvedValue(null);
      await expect(service.register(VALID_USER_DATA, {})).rejects.toMatchObject({ statusCode: 403 });
    });

    it('lanza notFound si el tipo de documento no existe o está inactivo', async () => {
      armHappyRegister();
      documentTypeRepository.findById.mockResolvedValue({ is_active: false });
      await expect(service.register(VALID_USER_DATA, {})).rejects.toMatchObject({ statusCode: 404 });
    });

    it('lanza forbidden si el tipo de documento no es visible al cliente', async () => {
      armHappyRegister();
      documentTypeRepository.findById.mockResolvedValue({ document_type_id: 'dt-1', is_active: true, is_visible_to_client: false });
      await expect(service.register(VALID_USER_DATA, {})).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('register — validación de unicidad', () => {
    it('lanza conflict si el email ya está registrado', async () => {
      armHappyRegister();
      personContactRepository.findByEmail.mockResolvedValue({ person_contact_id: 'x' });
      await expect(service.register(VALID_USER_DATA, {})).rejects.toMatchObject({ statusCode: 409 });
    });

    it('lanza conflict si el documento ya está registrado', async () => {
      armHappyRegister();
      personRepository.findByNationalId.mockResolvedValue({ person_id: 'x' });
      await expect(service.register(VALID_USER_DATA, {})).rejects.toMatchObject({ statusCode: 409 });
    });

    it('lanza notFound si el género seleccionado no existe', async () => {
      armHappyRegister();
      genderRepository.exists.mockResolvedValue(false);
      await expect(service.register({ ...VALID_USER_DATA, genderId: 'g-x' }, {})).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('register — rollback de creación', () => {
    it('mapea un error NO operativo a internal tras el rollback de la transacción', async () => {
      armHappyRegister();
      const tx = { commit: jest.fn(), rollback: jest.fn().mockResolvedValue(undefined) };
      sequelize.transaction.mockResolvedValue(tx);
      roleRepository.findByName.mockResolvedValue({ role_id: 'r' });
      personRepository.create.mockRejectedValue(new Error('db boom')); // error crudo, no operativo

      await expect(service.register(VALID_USER_DATA, {})).rejects.toMatchObject({ statusCode: 500 });
      expect(tx.rollback).toHaveBeenCalled();
    });

    it('propaga tal cual un error operativo (ej: rol CLIENTE ausente)', async () => {
      armHappyRegister();
      roleRepository.findByName.mockResolvedValue(null); // → AppError.internal operativo dentro de la tx
      await expect(service.register(VALID_USER_DATA, {})).rejects.toMatchObject({ statusCode: 500, isOperational: true });
    });
  });

  describe('requestResetCredentials — anti-enumeración', () => {
    it('devuelve false si el email no corresponde a un usuario', async () => {
      personContactRepository.findByEmail.mockResolvedValue(null);
      await expect(service.requestResetCredentials({ email: 'x@x.com', type: 'password' })).resolves.toBe(false);
      expect(resetCredentialsRepository.createResetToken).not.toHaveBeenCalled();
    });

    it('devuelve false si el usuario está inactivo', async () => {
      personContactRepository.findByEmail.mockResolvedValue({ person: { first_name: 'Ada', user: { user_id: 'u-1', is_active: false } } });
      await expect(service.requestResetCredentials({ email: 'x@x.com', type: 'password' })).resolves.toBe(false);
      expect(resetCredentialsRepository.createResetToken).not.toHaveBeenCalled();
    });

    it('genera y persiste el token, audita, notifica y devuelve true (password)', async () => {
      personContactRepository.findByEmail.mockResolvedValue({
        person: { first_name: 'Ada', user: { user_id: 'u-1', is_active: true } }
      });
      resetCredentialsRepository.invalidateUserTokens.mockResolvedValue(1);
      resetCredentialsRepository.createResetToken.mockResolvedValue({});
      NotificationUtil.crearNotificacionDirecta.mockResolvedValue(undefined);

      const result = await service.requestResetCredentials({ email: 'x@x.com', type: 'password' });

      expect(result).toBe(true);
      expect(resetCredentialsRepository.createResetToken).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'u-1', email: 'x@x.com', type: 'password' })
      );
      expect(logAudit).toHaveBeenCalledWith('CREDENTIALS_RESET_REQUESTED', 'u-1', expect.any(Object), expect.any(Object));

      await flush();
      expect(NotificationUtil.crearNotificacionDirecta).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'SOLICITUD_RESET_PASSWORD' })
      );
    });

    it('usa la plantilla de MFA cuando el tipo es mfa', async () => {
      personContactRepository.findByEmail.mockResolvedValue({
        person: { first_name: 'Ada', user: { user_id: 'u-1', is_active: true } }
      });
      resetCredentialsRepository.invalidateUserTokens.mockResolvedValue(0);
      resetCredentialsRepository.createResetToken.mockResolvedValue({});
      NotificationUtil.crearNotificacionDirecta.mockResolvedValue(undefined);

      await service.requestResetCredentials({ email: 'x@x.com', type: 'mfa' });
      await flush();
      expect(NotificationUtil.crearNotificacionDirecta).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'SOLICITUD_RESET_MFA' })
      );
    });
  });

  describe('confirmResetCredentials', () => {
    function txOk() {
      const tx = { commit: jest.fn().mockResolvedValue(undefined), rollback: jest.fn().mockResolvedValue(undefined) };
      sequelize.transaction.mockResolvedValue(tx);
      return tx;
    }

    it('lanza badRequest si el token es inválido o expiró', async () => {
      resetCredentialsRepository.findValidToken.mockResolvedValue(null);
      await expect(service.confirmResetCredentials({ token: 't', type: 'password', newPassword: 'x' })).rejects.toMatchObject({
        statusCode: 400
      });
    });

    it('lanza badRequest si el tipo del registro no coincide con el solicitado', async () => {
      resetCredentialsRepository.findValidToken.mockResolvedValue({ type: 'mfa', user: { user_id: 'u-1' } });
      await expect(service.confirmResetCredentials({ token: 't', type: 'password', newPassword: 'x' })).rejects.toMatchObject({
        statusCode: 400
      });
    });

    it('resetea la contraseña, commitea, audita e invalida sesiones', async () => {
      const tx = txOk();
      resetCredentialsRepository.findValidToken.mockResolvedValue({
        reset_credentials_id: 'rc-1',
        type: 'password',
        user: { user_id: 'u-1', person: { first_name: 'Ada', contact: { email: 'x@x.com' } } }
      });
      userRepository.updatePassword.mockResolvedValue(undefined);
      resetCredentialsRepository.markAsUsed.mockResolvedValue(undefined);
      TokenBlacklistUtil.invalidateUserSessions.mockResolvedValue(undefined);
      userSessionRepository.closeAllByUser.mockResolvedValue(undefined);
      NotificationUtil.crearNotificacion.mockResolvedValue(undefined);

      const result = await service.confirmResetCredentials({ token: 't', type: 'password', newPassword: 'Nueva123!' });

      expect(userRepository.updatePassword).toHaveBeenCalledWith('u-1', 'Nueva123!', { transaction: tx });
      expect(tx.commit).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith('PASSWORD_RESET_CONFIRMED', 'u-1', expect.any(Object), expect.any(Object));
      expect(TokenBlacklistUtil.invalidateUserSessions).toHaveBeenCalledWith('u-1');
      expect(result).toBeNull();
    });

    it('lanza badRequest si es reset de password sin newPassword y hace rollback', async () => {
      const tx = txOk();
      resetCredentialsRepository.findValidToken.mockResolvedValue({
        reset_credentials_id: 'rc-1',
        type: 'password',
        user: { user_id: 'u-1' }
      });
      await expect(service.confirmResetCredentials({ token: 't', type: 'password' })).rejects.toMatchObject({ statusCode: 400 });
      expect(tx.rollback).toHaveBeenCalled();
    });

    it('resetea el MFA (baja TOTP/SMS) y registra los cambios', async () => {
      const tx = txOk();
      resetCredentialsRepository.findValidToken.mockResolvedValue({
        reset_credentials_id: 'rc-1',
        type: 'mfa',
        user: { user_id: 'u-1', person: { first_name: 'Ada', contact: { email: 'x@x.com' } } }
      });
      userRepository.update.mockResolvedValue(undefined);
      KycSharedUtil.logChange.mockResolvedValue(undefined);
      resetCredentialsRepository.markAsUsed.mockResolvedValue(undefined);
      NotificationUtil.crearNotificacion.mockResolvedValue(undefined);

      const result = await service.confirmResetCredentials({ token: 't', type: 'mfa' });

      expect(userRepository.update).toHaveBeenCalledWith(
        'u-1',
        expect.objectContaining({ totp_enabled: false, totp_secret: null, sms_mfa_enabled: false, preferred_mfa_method: 'none' }),
        { transaction: tx }
      );
      expect(KycSharedUtil.logChange).toHaveBeenCalledTimes(2);
      expect(logAudit).toHaveBeenCalledWith('MFA_RESET_CONFIRMED', 'u-1', expect.any(Object), expect.any(Object));
      // No se invalidan sesiones en reset de MFA (solo en password).
      expect(TokenBlacklistUtil.invalidateUserSessions).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('hace rollback y propaga si falla la aplicación del reset', async () => {
      const tx = txOk();
      resetCredentialsRepository.findValidToken.mockResolvedValue({
        reset_credentials_id: 'rc-1',
        type: 'password',
        user: { user_id: 'u-1' }
      });
      userRepository.updatePassword.mockRejectedValue(new Error('update fail'));
      await expect(service.confirmResetCredentials({ token: 't', type: 'password', newPassword: 'x' })).rejects.toThrow('update fail');
      expect(tx.rollback).toHaveBeenCalled();
    });
  });
});
