// tests/unit/modules/shared-endpoints/kyc/iam/services/auth-login/trusted-device-management.service.test.js
//
// blockDevice: regresión de la fase 4 de la migración a TS — el repositorio recibe desde qué
// dispositivo de confianza se bloqueó (antes blocked_by_device_id quedaba vacío).

jest.mock('shared/models', () => ({}));
jest.mock('shared/utils/logger.util', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  logAudit: jest.fn()
}));
jest.mock('shared/utils/device-blocklist.util', () => ({ block: jest.fn().mockResolvedValue(undefined) }));
jest.mock('shared/utils/token-blacklist.util', () => ({
  invalidateDeviceTokens: jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined)
}));

const TrustedDeviceManagementService = require('modules/shared-endpoints/kyc/iam/services/auth-login/trusted-device-management.service');

describe('TrustedDeviceManagementService.blockDevice', () => {
  it('registra el dispositivo de confianza que hizo el bloqueo', async () => {
    const trustedDeviceRepository = {
      findByFingerprint: jest.fn().mockResolvedValue({ user_trusted_device_id: 'dev-actual', status: 'trusted' }),
      findByIdAndUser: jest.fn().mockResolvedValue({ user_trusted_device_id: 'dev-x', status: 'pending', fingerprint_hash: 'fp-x' }),
      countTrusted: jest.fn().mockResolvedValue(2),
      block: jest.fn().mockResolvedValue({ user_trusted_device_id: 'dev-x', status: 'blocked' })
    };
    const service = new TrustedDeviceManagementService({ trustedDeviceRepository });

    await service.blockDevice('u-1', 'dev-x', 'fp-actual').catch(() => undefined);

    expect(trustedDeviceRepository.block).toHaveBeenCalledWith('dev-x', 'dev-actual');
  });
});
