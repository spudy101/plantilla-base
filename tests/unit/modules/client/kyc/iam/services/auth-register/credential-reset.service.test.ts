// tests/unit/modules/client/kyc/iam/services/auth-register/credential-reset.service.test.ts
//
// CredentialResetService (extraído de AuthRegisterService). Se prueba SIN jest.mock de
// repositorios: las dependencias se inyectan por constructor (SOLID: D).

jest.mock('shared/models', () => ({}));
jest.mock('shared/utils/logger.util', () => ({ logger: { info: jest.fn(), warn: jest.fn() }, logAudit: jest.fn() }));
jest.mock('shared/utils/token-blacklist.util', () => ({ invalidateUserSessions: jest.fn().mockResolvedValue(undefined) }));

import { mocked, Loose, fixture } from 'tests/helpers/mock';
import CredentialResetService = require('modules/client/kyc/iam/services/auth-register/credential-reset.service');
import TokenBlacklistUtilModule = require('shared/utils/token-blacklist.util');
const TokenBlacklistUtil = mocked(TokenBlacklistUtilModule);
import loggerUtilModule = require('shared/utils/logger.util');
const { logAudit } = mocked(loggerUtilModule);

const flush = () => new Promise(resolve => { setImmediate(resolve); });

const makeService = () => {
  const transaction = { commit: jest.fn().mockResolvedValue(undefined), rollback: jest.fn().mockResolvedValue(undefined) };
  const deps = {
    unitOfWork: { begin: jest.fn().mockResolvedValue(transaction) },
    userRepository: { updatePassword: jest.fn().mockResolvedValue(undefined), update: jest.fn().mockResolvedValue(undefined) },
    personContactRepository: { findByEmailWithUser: jest.fn() },
    resetCredentialsRepository: {
      invalidateUserTokens: jest.fn().mockResolvedValue(0),
      createResetToken: jest.fn().mockResolvedValue({}),
      findValidTokenWithUser: jest.fn(),
      markAsUsed: jest.fn().mockResolvedValue(undefined)
    },
    userSessionRepository: { closeAllByUser: jest.fn().mockResolvedValue(undefined) },
    NotificationUtil: {
      crearNotificacion: jest.fn().mockResolvedValue({}),
      crearNotificacionDirecta: jest.fn().mockResolvedValue({})
    },
    kycSharedUtil: { logChange: jest.fn().mockResolvedValue(undefined) }
  };
  return { service: new CredentialResetService(fixture(deps)), deps, transaction };
};

const resetRecord = (type: Loose, over = {}) => ({
  reset_credentials_id: 'rc-1',
  type,
  user: { user_id: 'u-1', person: { first_name: 'Ada', contact: { email: 'ada@x.cl' } } },
  ...over
});

describe('CredentialResetService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('requestResetCredentials', () => {
    it('anti-enumeración: email inexistente o usuario inactivo responden false sin crear token', async () => {
      const { service, deps } = makeService();
      deps.personContactRepository.findByEmailWithUser.mockResolvedValueOnce(null);
      await expect(service.requestResetCredentials({ email: 'x@x.cl', type: 'password' })).resolves.toBe(false);

      deps.personContactRepository.findByEmailWithUser.mockResolvedValueOnce({ person: { user: { user_id: 'u-1', is_active: false } } });
      await expect(service.requestResetCredentials({ email: 'x@x.cl', type: 'password' })).resolves.toBe(false);

      expect(deps.resetCredentialsRepository.createResetToken).not.toHaveBeenCalled();
    });

    it('crea un token nuevo invalidando los anteriores y envía el enlace por email', async () => {
      const { service, deps } = makeService();
      deps.personContactRepository.findByEmailWithUser.mockResolvedValue({ person: { first_name: 'Ada', user: { user_id: 'u-1', is_active: true } } });

      await expect(service.requestResetCredentials({ email: 'ada@x.cl', type: 'mfa' })).resolves.toBe(true);
      await flush();

      expect(deps.resetCredentialsRepository.invalidateUserTokens).toHaveBeenCalledWith('u-1');
      expect(deps.resetCredentialsRepository.createResetToken).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'u-1', email: 'ada@x.cl', type: 'mfa', token: expect.stringMatching(/^[a-f0-9]{64}$/) })
      );
      expect(deps.NotificationUtil.crearNotificacionDirecta).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'SOLICITUD_RESET_MFA', email: 'ada@x.cl' })
      );
    });
  });

  describe('confirmResetCredentials', () => {
    it('token inválido o de otro tipo → 400 sin abrir transacción', async () => {
      const { service, deps } = makeService();
      deps.resetCredentialsRepository.findValidTokenWithUser.mockResolvedValueOnce(null);
      await expect(service.confirmResetCredentials({ token: 't', type: 'password' })).rejects.toMatchObject({ statusCode: 400 });

      deps.resetCredentialsRepository.findValidTokenWithUser.mockResolvedValueOnce(resetRecord('mfa'));
      await expect(service.confirmResetCredentials({ token: 't', type: 'password' })).rejects.toThrow('Tipo de reset incorrecto');

      expect(deps.unitOfWork.begin).not.toHaveBeenCalled();
    });

    it('password: actualiza, marca el token usado en la transacción e invalida todas las sesiones', async () => {
      const { service, deps, transaction } = makeService();
      deps.resetCredentialsRepository.findValidTokenWithUser.mockResolvedValue(resetRecord('password'));

      await service.confirmResetCredentials({ token: 't', type: 'password', newPassword: 'N3w!pass' });

      expect(deps.userRepository.updatePassword).toHaveBeenCalledWith('u-1', 'N3w!pass', { transaction });
      expect(deps.resetCredentialsRepository.markAsUsed).toHaveBeenCalledWith('rc-1', { transaction });
      expect(transaction.commit).toHaveBeenCalled();
      expect(TokenBlacklistUtil.invalidateUserSessions).toHaveBeenCalledWith('u-1');
      expect(deps.userSessionRepository.closeAllByUser).toHaveBeenCalledWith('u-1', 'password_reset');
      expect(logAudit).toHaveBeenCalledWith('PASSWORD_RESET_CONFIRMED', 'u-1', { type: 'password' }, expect.any(Object));
    });

    it('mfa: baja TOTP y SMS, registra ambos cambios y NO cierra sesiones', async () => {
      const { service, deps, transaction } = makeService();
      deps.resetCredentialsRepository.findValidTokenWithUser.mockResolvedValue(resetRecord('mfa'));

      await service.confirmResetCredentials({ token: 't', type: 'mfa' });

      expect(deps.userRepository.update).toHaveBeenCalledWith(
        'u-1',
        expect.objectContaining({ totp_enabled: false, totp_secret: null, sms_mfa_enabled: false, preferred_mfa_method: 'none' }),
        { transaction }
      );
      expect(deps.kycSharedUtil.logChange.mock.calls.map(([data]) => data.changeType)).toEqual(['mfa_status', 'sms_mfa_status']);
      expect(deps.userSessionRepository.closeAllByUser).not.toHaveBeenCalled();
    });

    it('si falla dentro de la transacción hace rollback y propaga', async () => {
      const { service, deps, transaction } = makeService();
      deps.resetCredentialsRepository.findValidTokenWithUser.mockResolvedValue(resetRecord('password'));

      await expect(service.confirmResetCredentials({ token: 't', type: 'password' })).rejects.toThrow('La nueva contraseña es requerida');
      expect(transaction.rollback).toHaveBeenCalled();
      expect(transaction.commit).not.toHaveBeenCalled();
    });
  });
});
