// tests/unit/shared/mfa-status.util.test.ts
//
// isMfaActive lee la fuente de verdad (totp_enabled || sms_mfa_enabled) desde BD, no del JWT,
// para que el gate surta efecto apenas el usuario activa su 2FA sin re-login.

jest.mock('modules/schemas/kyc/iam/repositories/user.repository', () => ({
  findMfaFlags: jest.fn()
}));

import { mocked } from 'tests/helpers/mock';
import userRepositoryModule = require('modules/schemas/kyc/iam/repositories/user.repository');
const userRepository = mocked(userRepositoryModule);
import mfaStatusUtilModule = require('shared/utils/mfa-status.util');
const { isMfaActive } = mfaStatusUtilModule;

describe('isMfaActive', () => {
  beforeEach(() => {
    userRepository.findMfaFlags.mockReset();
  });

  it('retorna false sin consultar BD cuando no hay userId', async () => {
    await expect(isMfaActive(null)).resolves.toBe(false);
    expect(userRepository.findMfaFlags).not.toHaveBeenCalled();
  });

  it('retorna false cuando el usuario no existe', async () => {
    userRepository.findMfaFlags.mockResolvedValue(null);
    await expect(isMfaActive('u1')).resolves.toBe(false);
  });

  it('retorna true cuando TOTP está activo', async () => {
    userRepository.findMfaFlags.mockResolvedValue({ totp_enabled: true, sms_mfa_enabled: false });
    await expect(isMfaActive('u1')).resolves.toBe(true);
  });

  it('retorna true cuando SMS MFA está activo', async () => {
    userRepository.findMfaFlags.mockResolvedValue({ totp_enabled: false, sms_mfa_enabled: true });
    await expect(isMfaActive('u1')).resolves.toBe(true);
  });

  it('retorna false cuando ningún factor está activo', async () => {
    userRepository.findMfaFlags.mockResolvedValue({ totp_enabled: false, sms_mfa_enabled: false });
    await expect(isMfaActive('u1')).resolves.toBe(false);
  });

  it('consulta los flags de MFA del usuario vía repositorio', async () => {
    userRepository.findMfaFlags.mockResolvedValue({ totp_enabled: true, sms_mfa_enabled: false });
    await isMfaActive('u-42');
    expect(userRepository.findMfaFlags).toHaveBeenCalledWith('u-42');
  });
});
