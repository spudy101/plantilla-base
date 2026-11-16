// tests/unit/modules/shared-endpoints/kyc/iam/services/auth-login/login-policy-gate.service.test.js
//
// LoginPolicyGateService: compuerta de política de privacidad que comparten el login por
// contraseña y el biométrico. Dependencias inyectadas por constructor (SOLID: D).

jest.mock('shared/models', () => ({}));
jest.mock('shared/utils/logger.util', () => ({ logger: { warn: jest.fn() }, logAudit: jest.fn() }));

const LoginPolicyGateService = require('modules/shared-endpoints/kyc/iam/services/auth-login/login-policy-gate.service');
const { logAudit } = require('shared/utils/logger.util');
const { INTERNAL_ROLE_NAMES } = require('shared/constants');

const ACTIVE_POLICY = { privacy_policy_id: 'pp-2', version: '2.0', document_url: 'http://x/p.pdf', summary: 's', effective_date: 'd' };
const CONTEXT = { blockedAuditAction: 'LOGIN_BLOCKED_POLICY_UPDATE', source: 'auth-login' };

const makeGate = ({ activePolicy = ACTIVE_POLICY } = {}) => {
  const deps = {
    userRepository: { updatePrivacyPolicy: jest.fn().mockResolvedValue(undefined) },
    privacyPolicyRepository: { findActive: jest.fn().mockResolvedValue(activePolicy) },
    consentRecorder: { grantPrivacyPolicy: jest.fn().mockResolvedValue({}) }
  };
  return { gate: new LoginPolicyGateService(deps), deps };
};

const client = (over = {}) => ({ user_id: 'u-1', role: { name: 'cliente' }, privacy_policy_version: '1.0', ...over });

describe('LoginPolicyGateService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deja pasar a usuarios internos sin evaluar la versión', async () => {
    const { gate } = makeGate();
    await expect(gate.check(client({ role: { name: INTERNAL_ROLE_NAMES[0] } }), false, null, CONTEXT)).resolves.toBeNull();
  });

  it('deja pasar si no hay política activa o si el usuario ya está en la versión activa', async () => {
    await expect(makeGate({ activePolicy: null }).gate.check(client(), false, null, CONTEXT)).resolves.toBeNull();
    await expect(makeGate().gate.check(client({ privacy_policy_version: '2.0' }), false, null, CONTEXT)).resolves.toBeNull();
  });

  it('con acceptPolicy=true registra la versión, el consentimiento y la auditoría, y deja pasar', async () => {
    const { gate, deps } = makeGate();

    await expect(gate.check(client(), true, '1.2.3.4', CONTEXT)).resolves.toBeNull();

    expect(deps.userRepository.updatePrivacyPolicy).toHaveBeenCalledWith('u-1', expect.objectContaining({ version: '2.0', acceptedIp: '1.2.3.4' }));
    expect(deps.consentRecorder.grantPrivacyPolicy).toHaveBeenCalledWith({ userId: 'u-1', privacyPolicyId: 'pp-2', ip: '1.2.3.4' });
    expect(logAudit).toHaveBeenCalledWith('PRIVACY_POLICY_ACCEPTED', 'u-1', expect.any(Object), expect.any(Object));
  });

  it('versión desactualizada sin aceptar: audita con la acción del origen y devuelve el DTO de bloqueo', async () => {
    const { gate, deps } = makeGate();

    const result = await gate.check(client(), false, null, { blockedAuditAction: 'BIOMETRIC_LOGIN_BLOCKED_POLICY_UPDATE', source: 'auth-biometric' });

    expect(deps.userRepository.updatePrivacyPolicy).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith('BIOMETRIC_LOGIN_BLOCKED_POLICY_UPDATE', 'u-1', expect.any(Object), expect.objectContaining({ outcome: 'failure' }));
    expect(result).toMatchObject({
      requiresPolicyAcceptance: true,
      policy: { currentVersion: '1.0', newVersion: '2.0', documentUrl: 'http://x/p.pdf' }
    });
  });
});
