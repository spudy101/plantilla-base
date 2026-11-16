// tests/unit/modules/shared-endpoints/kyc/iam/services/auth-login/session-issuer.service.test.js
//
// SessionIssuerService emite la sesión autenticada que comparten el login por contraseña, el
// biométrico y el registro. Dependencias inyectadas por constructor (SOLID: D).

jest.mock('shared/models', () => ({}));
jest.mock('shared/utils/logger.util', () => ({ logger: { warn: jest.fn(), info: jest.fn() } }));

const SessionIssuerService = require('modules/shared-endpoints/kyc/iam/services/auth-login/session-issuer.service');
const { logger } = require('shared/utils/logger.util');

const USER = { user_id: 'u-1' };

const makeIssuer = ({ jtiSaved = true } = {}) => {
  const deps = {
    userSessionRepository: { create: jest.fn().mockResolvedValue({}) },
    jwt: {
      generateAccessToken: jest.fn().mockResolvedValue('access-1'),
      generateRefreshToken: jest.fn().mockResolvedValue('refresh-1')
    },
    refreshTokenStore: { save: jest.fn().mockResolvedValue(jtiSaved) }
  };
  return { issuer: new SessionIssuerService(deps), deps };
};

describe('SessionIssuerService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('emite el par de tokens con el mismo sessionId que la fila de sesión y guarda el JTI', async () => {
    const { issuer, deps } = makeIssuer();

    const { sessionId, tokens } = await issuer.issue(USER, { deviceId: 'd-1', ip: '1.2.3.4', userAgent: 'jest', source: 'login' });

    expect(tokens).toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    expect(deps.jwt.generateAccessToken).toHaveBeenCalledWith(USER, sessionId);
    const [, jti, refreshSessionId] = deps.jwt.generateRefreshToken.mock.calls[0];
    expect(refreshSessionId).toBe(sessionId);
    expect(deps.refreshTokenStore.save).toHaveBeenCalledWith(jti, 'u-1');
    expect(deps.userSessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_session_id: sessionId,
        user_id: 'u-1',
        device_id: 'd-1',
        jti,
        ip_address: '1.2.3.4',
        user_agent: 'jest'
      })
    );
  });

  it('sin dispositivo ni contexto deja esos campos en null (login automático post-registro)', async () => {
    const { issuer, deps } = makeIssuer();

    await issuer.issue(USER, { source: 'registro' });

    expect(deps.userSessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ device_id: null, ip_address: null, user_agent: null })
    );
  });

  it('si Redis no guarda el JTI avisa pero no bloquea la autenticación', async () => {
    const { issuer } = makeIssuer({ jtiSaved: false });

    await expect(issuer.issue(USER, { source: 'login biométrico' })).resolves.toHaveProperty('tokens');
    expect(logger.warn).toHaveBeenCalledWith('No se pudo guardar JTI de refresh token en login biométrico', { userId: 'u-1' });
  });
});
