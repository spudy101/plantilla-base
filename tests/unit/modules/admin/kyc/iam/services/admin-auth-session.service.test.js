// tests/unit/modules/admin/kyc/iam/services/admin-auth-session.service.test.js
//
// AdminAuthSessionService — vista admin de sesiones e intentos de autenticación. Probamos: listado de
// sesiones (con y sin filtro sessionId), listado por usuario, revocación de sesión (camino feliz +
// notFound + ya cerrada + ramas de warn en Redis) y listado de intentos (scope all/login, por usuario).
// Todo el I/O (repos, RefreshTokenStore, blacklist, notificaciones, DTOs) va mockeado.

jest.mock('modules/schemas/kyc/iam/repositories/user-session.repository', () => ({
  buildWhere: jest.fn(),
  findPaginated: jest.fn(),
  findById: jest.fn(),
  closeSession: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/records/audit/repositories/audit-log.repository', () => ({
  findPaginatedWithExecutor: jest.fn()
}));

jest.mock('shared/utils/refresh-token-store.util', () => ({
  revoke: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('shared/utils/token-blacklist.util', () => ({
  blacklistSession: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/notification/services/notification-creation.service', () => ({
  crearNotificacion: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('shared/utils/logger.util', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logAudit: jest.fn()
}));

jest.mock('shared/constants', () => ({
  notifications: { ses: { logoUrl: 'https://logo.test/logo.png' } }
}));

jest.mock('shared/models', () => ({
  UserTrustedDevice: {},
  User: {},
  Person: {},
  UserSession: { STATUS: { ACTIVE: 'active' } }
}));

jest.mock('modules/admin/kyc/iam/dtos/admin-auth-session.dto', () => ({
  SessionListDTO: jest.fn(() => ({ dto: 'sessions' })),
  AuthAttemptListDTO: jest.fn(() => ({ dto: 'attempts' }))
}));

const userSessionRepository = require('modules/schemas/kyc/iam/repositories/user-session.repository');
const auditLogRepository = require('modules/schemas/records/audit/repositories/audit-log.repository');
const RefreshTokenStore = require('shared/utils/refresh-token-store.util');
const TokenBlacklistUtil = require('shared/utils/token-blacklist.util');
const NotificationCreationService = require('modules/schemas/notification/services/notification-creation.service');
const { logAudit, logger } = require('shared/utils/logger.util');
const { SessionListDTO, AuthAttemptListDTO } = require('modules/admin/kyc/iam/dtos/admin-auth-session.dto');
const service = require('modules/admin/kyc/iam/services/admin-auth-session.service');

// Helper de flush con cuerpo de bloque (eslint no-promise-executor-return).
const flush = () =>
  new Promise(resolve => {
    setImmediate(resolve);
  });

const ADMIN_ID = 'admin-1';

describe('AdminAuthSessionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userSessionRepository.buildWhere.mockReturnValue({});
    userSessionRepository.findPaginated.mockResolvedValue({ rows: [{ user_session_id: 's1' }], count: 1 });
    auditLogRepository.findPaginatedWithExecutor.mockResolvedValue({ rows: [{ audit_log_id: 'a1' }], count: 1 });
  });

  describe('listSessions', () => {
    it('pagina, audita y delega en SessionListDTO', async () => {
      const result = await service.listSessions({ page: '2', limit: '5' }, ADMIN_ID);

      expect(userSessionRepository.findPaginated).toHaveBeenCalledTimes(1);
      expect(logAudit).toHaveBeenCalledWith(
        'AUTH_SESSION_LIST_VIEWED',
        ADMIN_ID,
        { totalItems: 1 },
        expect.objectContaining({ entityType: 'AuthSession' })
      );
      expect(SessionListDTO).toHaveBeenCalledWith(
        [{ user_session_id: 's1' }],
        expect.objectContaining({ totalItems: 1, page: 2, limit: 5, filters: {} })
      );
      expect(result).toEqual({ dto: 'sessions' });
    });

    it('propaga el filtro sessionId cuando viene en el query', async () => {
      await service.listSessions({ sessionId: 'sess-9' }, ADMIN_ID);

      expect(SessionListDTO).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ filters: { sessionId: 'sess-9' } })
      );
    });
  });

  describe('getSessionsByUser', () => {
    it('arma el where por usuario/estado, audita y responde el DTO', async () => {
      await service.getSessionsByUser('user-7', { status: 'active' }, ADMIN_ID);

      expect(userSessionRepository.buildWhere).toHaveBeenCalledWith({ userId: 'user-7', status: 'active' });
      expect(logAudit).toHaveBeenCalledWith(
        'AUTH_SESSION_BY_USER_VIEWED',
        ADMIN_ID,
        { targetUserId: 'user-7' },
        expect.objectContaining({ entityId: 'user-7' })
      );
      expect(SessionListDTO).toHaveBeenCalled();
    });
  });

  describe('revokeSession', () => {
    const activeSession = { status: 'active', jti: 'jti-1', user_id: 'user-9' };

    it('cierra la sesión, revoca en Redis, audita y notifica (admin + cliente)', async () => {
      userSessionRepository.findById.mockResolvedValue(activeSession);

      const result = await service.revokeSession('sess-1', ADMIN_ID);

      expect(userSessionRepository.closeSession).toHaveBeenCalledWith('sess-1', 'revoked_by_admin');
      expect(RefreshTokenStore.revoke).toHaveBeenCalledWith('jti-1');
      expect(TokenBlacklistUtil.blacklistSession).toHaveBeenCalledWith('sess-1');
      expect(logAudit).toHaveBeenCalledWith(
        'AUTH_SESSION_REVOKED',
        ADMIN_ID,
        expect.objectContaining({ targetUserId: 'user-9', jti: 'jti-1' }),
        expect.objectContaining({ entityId: 'sess-1' })
      );
      expect(result).toEqual({ sessionId: 'sess-1', status: 'closed', closeReason: 'revoked_by_admin' });

      await flush();
      expect(NotificationCreationService.crearNotificacion).toHaveBeenCalledTimes(2);
      const tipos = NotificationCreationService.crearNotificacion.mock.calls.map(c => c[0].tipoNotificacion);
      expect(tipos).toEqual(['AUTH_SESSION_REVOKED_INTERNAL', 'AUTH_SESSION_REVOKED_CLIENT']);
    });

    it('lanza 404 cuando la sesión no existe', async () => {
      userSessionRepository.findById.mockResolvedValue(null);

      await expect(service.revokeSession('nope', ADMIN_ID)).rejects.toThrow('Sesión no encontrada');
      expect(userSessionRepository.closeSession).not.toHaveBeenCalled();
    });

    it('lanza 400 cuando la sesión ya está cerrada', async () => {
      userSessionRepository.findById.mockResolvedValue({ status: 'closed', jti: 'j', user_id: 'u' });

      await expect(service.revokeSession('sess-1', ADMIN_ID)).rejects.toThrow('La sesión ya está cerrada');
      expect(userSessionRepository.closeSession).not.toHaveBeenCalled();
    });

    it('registra warn si falla la revocación de JTI en Redis (best-effort)', async () => {
      userSessionRepository.findById.mockResolvedValue(activeSession);
      RefreshTokenStore.revoke.mockRejectedValueOnce(new Error('redis down'));

      await service.revokeSession('sess-1', ADMIN_ID);
      await flush();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error revocando JTI'),
        expect.objectContaining({ error: 'redis down' })
      );
    });

    it('registra warn si falla la invalidación del access token en Redis', async () => {
      userSessionRepository.findById.mockResolvedValue(activeSession);
      TokenBlacklistUtil.blacklistSession.mockRejectedValueOnce(new Error('blacklist fail'));

      await service.revokeSession('sess-1', ADMIN_ID);
      await flush();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error invalidando la sesión'),
        expect.objectContaining({ error: 'blacklist fail' })
      );
    });

    it('registra warn si falla el envío de una notificación', async () => {
      userSessionRepository.findById.mockResolvedValue(activeSession);
      NotificationCreationService.crearNotificacion.mockRejectedValue(new Error('notif fail'));

      await service.revokeSession('sess-1', ADMIN_ID);
      await flush();

      expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/AUTH_SESSION_REVOKED/), expect.objectContaining({ error: 'notif fail' }));
    });
  });

  describe('listAttempts', () => {
    it('scope por defecto = all → filtra por categoría Autenticación', async () => {
      await service.listAttempts({}, ADMIN_ID);

      const where = auditLogRepository.findPaginatedWithExecutor.mock.calls[0][0];
      expect(where.category).toBe('Autenticación');
      expect(where.action).toBeUndefined();
      expect(logAudit).toHaveBeenCalledWith(
        'AUTH_ATTEMPTS_LIST_VIEWED',
        ADMIN_ID,
        expect.objectContaining({ scope: 'all' }),
        expect.anything()
      );
      expect(AuthAttemptListDTO).toHaveBeenCalledWith(
        [{ audit_log_id: 'a1' }],
        expect.objectContaining({ filters: { scope: 'all' } })
      );
    });

    it('scope=login → filtra por acciones de login (no toda la categoría)', async () => {
      await service.listAttempts({ scope: 'login', userId: 'u-1', outcome: 'FAILED' }, ADMIN_ID);

      const where = auditLogRepository.findPaginatedWithExecutor.mock.calls[0][0];
      expect(where.action).toBeDefined();
      expect(where.category).toBeUndefined();
      expect(where.user_id).toBe('u-1');
      expect(where.outcome).toBe('FAILED');
    });
  });

  describe('getAttemptsByUser', () => {
    it('fuerza el user_id del path por sobre el del query y audita', async () => {
      await service.getAttemptsByUser('user-target', { userId: 'ignorado', scope: 'all' }, ADMIN_ID);

      const where = auditLogRepository.findPaginatedWithExecutor.mock.calls[0][0];
      expect(where.user_id).toBe('user-target');
      expect(logAudit).toHaveBeenCalledWith(
        'AUTH_ATTEMPTS_BY_USER_VIEWED',
        ADMIN_ID,
        expect.objectContaining({ targetUserId: 'user-target', scope: 'all' }),
        expect.objectContaining({ entityId: 'user-target' })
      );
    });
  });
});
