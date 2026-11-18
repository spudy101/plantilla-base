// tests/unit/modules/schemas/core/repositories/core-integration-repositories.prisma.test.ts
//
// Repositorios del grupo 4 (integraciones y config) sobre Prisma (docs/prisma-migration.md, fase 5):
// se mockea el cliente único. Incluye los casos que antes cubría orm-encapsulation con Sequelize
// (resolve/markExpired de la doble aprobación).

const mockDb = {
  $transaction: jest.fn(),
  approvalRequest: { updateMany: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  providerFallbackEvent: { findFirst: jest.fn(), update: jest.fn() },
  integrationApiLog: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
  user: { findMany: jest.fn() },
  userSession: { findMany: jest.fn() }
};

jest.mock('../../../src/shared/database/prisma', () => mockDb);

import { Prisma } from '../../../src/shared/database/generated/prisma/client';
import approvalRequestRepository from '../../../src/modules/approvals/repositories/approval-request.repository';
import providerFallbackEventRepository from '../../../src/modules/integration/repositories/provider-fallback-event.repository';
import integrationApiLogRepository from '../../../src/modules/integration/repositories/integration-api-log.repository';

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.$transaction.mockImplementation((fn: (tx: typeof mockDb) => unknown) => fn(mockDb));
});

describe('ApprovalRequestRepository — cierre y vencimiento', () => {
  it('resolve() actualiza por id y devuelve la solicitud con requester y secondApprover', async () => {
    mockDb.approvalRequest.updateMany.mockResolvedValue({ count: 1 });
    const withUsers = { approvalRequestId: 'req-1', status: 'approved', requester: {}, secondApprover: {} };
    mockDb.approvalRequest.findUnique.mockResolvedValue(withUsers);
    const changes = { status: 'approved' as const, secondApproverId: 'a-2', resolvedAt: new Date(), resolutionNotes: null, result: null };

    await expect(approvalRequestRepository.resolve('req-1', changes)).resolves.toBe(withUsers);

    expect(mockDb.approvalRequest.updateMany).toHaveBeenCalledWith({
      where: { approvalRequestId: 'req-1' },
      data: { status: 'approved', secondApproverId: 'a-2', resolvedAt: changes.resolvedAt, resolutionNotes: null, result: Prisma.DbNull }
    });
    expect(mockDb.approvalRequest.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { approvalRequestId: 'req-1' }, include: expect.objectContaining({ requester: expect.any(Object), secondApprover: expect.any(Object) }) })
    );
  });

  it('resolve() devuelve null si la solicitud ya no existe', async () => {
    mockDb.approvalRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(approvalRequestRepository.resolve('x', { status: 'rejected', secondApproverId: null, resolvedAt: null, resolutionNotes: null })).resolves.toBeNull();
    expect(mockDb.approvalRequest.findUnique).not.toHaveBeenCalled();
  });

  it('markExpired() solo marca si sigue pendiente y dice si lo hizo', async () => {
    const now = new Date('2026-01-01T03:00:00Z');
    mockDb.approvalRequest.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await expect(approvalRequestRepository.markExpired('req-1', now)).resolves.toBe(true);
    await expect(approvalRequestRepository.markExpired('req-2', now)).resolves.toBe(false);
    expect(mockDb.approvalRequest.updateMany).toHaveBeenCalledWith({
      where: { approvalRequestId: 'req-1', status: 'pending' },
      data: { status: 'expired', resolvedAt: now }
    });
  });
});

describe('ProviderFallbackEventRepository.closeFallback', () => {
  it('cierra la ventana abierta más reciente desde el inicio menos la tolerancia', async () => {
    const startedAt = new Date('2026-01-01T00:00:10Z');
    mockDb.providerFallbackEvent.findFirst.mockResolvedValue({ fallbackEventId: 'f-1' });
    mockDb.providerFallbackEvent.update.mockResolvedValue('closed');

    await expect(providerFallbackEventRepository.closeFallback({ provider: 'sms', startedAt, endedAt: new Date(), affectedCount: 4 })).resolves.toBe('closed');

    expect(mockDb.providerFallbackEvent.findFirst).toHaveBeenCalledWith({
      where: { provider: 'sms', endedAt: null, startedAt: { gte: new Date('2026-01-01T00:00:05Z') } },
      orderBy: { startedAt: 'desc' }
    });
    expect(mockDb.providerFallbackEvent.update).toHaveBeenCalledWith({
      where: { fallbackEventId: 'f-1' },
      data: { endedAt: expect.any(Date), affectedProcessesCount: 4 }
    });
  });

  it('sin ventana abierta devuelve null', async () => {
    mockDb.providerFallbackEvent.findFirst.mockResolvedValue(null);
    await expect(providerFallbackEventRepository.closeFallback({ provider: 'sms', endedAt: new Date(), affectedCount: null })).resolves.toBeNull();
    expect(mockDb.providerFallbackEvent.update).not.toHaveBeenCalled();
  });
});

describe('IntegrationApiLogRepository', () => {
  it('adjunta el usuario y la sesión de origen con una consulta por tabla', async () => {
    mockDb.integrationApiLog.findMany.mockResolvedValue([
      { apiLogId: 'l-1', userId: 'u-1', sessionId: 's-1' },
      { apiLogId: 'l-2', userId: null, sessionId: null }
    ]);
    mockDb.integrationApiLog.count.mockResolvedValue(2);
    mockDb.user.findMany.mockResolvedValue([{ userId: 'u-1', username: 'ana' }]);
    mockDb.userSession.findMany.mockResolvedValue([{ userSessionId: 's-1', status: 'active' }]);

    const { rows, count } = await integrationApiLogRepository.findAllPaginated({ product: 'ses' }, { limit: 10, offset: 0 });

    expect(count).toBe(2);
    expect(rows[0]).toMatchObject({ user: { username: 'ana' }, session: { status: 'active' } });
    expect(rows[1]).toMatchObject({ user: null, session: null });
    expect(mockDb.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: { in: ['u-1'] } } }));
  });

  it('un producto o resultado fuera del enum no coincide con nada (sin consultar)', async () => {
    await expect(integrationApiLogRepository.findAllPaginated({ product: 'twilio' })).resolves.toEqual({ rows: [], count: 0 });
    await expect(integrationApiLogRepository.findAllPaginated({ result: 'weird' })).resolves.toEqual({ rows: [], count: 0 });
    expect(mockDb.integrationApiLog.findMany).not.toHaveBeenCalled();
  });
});
