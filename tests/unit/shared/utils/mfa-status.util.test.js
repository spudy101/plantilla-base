// tests/unit/shared/mfa-status.util.test.js
//
// isMfaActive lee la fuente de verdad (totp_enabled || sms_mfa_enabled) desde BD, no del JWT,
// para que el gate surta efecto apenas el usuario activa su 2FA sin re-login.

jest.mock('shared/models', () => ({
  User: { findOne: jest.fn() }
}));

const { User } = require('shared/models');
const { isMfaActive } = require('shared/utils/mfa-status.util');

describe('isMfaActive', () => {
  beforeEach(() => {
    User.findOne.mockReset();
  });

  it('retorna false sin consultar BD cuando no hay userId', async () => {
    await expect(isMfaActive(null)).resolves.toBe(false);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('retorna false cuando el usuario no existe', async () => {
    User.findOne.mockResolvedValue(null);
    await expect(isMfaActive('u1')).resolves.toBe(false);
  });

  it('retorna true cuando TOTP está activo', async () => {
    User.findOne.mockResolvedValue({ totp_enabled: true, sms_mfa_enabled: false });
    await expect(isMfaActive('u1')).resolves.toBe(true);
  });

  it('retorna true cuando SMS MFA está activo', async () => {
    User.findOne.mockResolvedValue({ totp_enabled: false, sms_mfa_enabled: true });
    await expect(isMfaActive('u1')).resolves.toBe(true);
  });

  it('retorna false cuando ningún factor está activo', async () => {
    User.findOne.mockResolvedValue({ totp_enabled: false, sms_mfa_enabled: false });
    await expect(isMfaActive('u1')).resolves.toBe(false);
  });

  it('consulta solo las columnas de MFA por user_id', async () => {
    User.findOne.mockResolvedValue({ totp_enabled: true, sms_mfa_enabled: false });
    await isMfaActive('u-42');
    expect(User.findOne).toHaveBeenCalledWith({
      where: { user_id: 'u-42' },
      attributes: ['totp_enabled', 'sms_mfa_enabled']
    });
  });
});
