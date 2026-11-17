// tests/unit/modules/schemas/repositories/orm-encapsulation.test.ts
//
// Fase 3 de docs/prisma-migration.md: lo que antes hacían services y workers sobre instancias o modelos
// de Sequelize (`request.update()` + `reload()`, `AuditLog.destroy`, `SmsDeliveryAttempt.count`) vive
// ahora en métodos con nombre de negocio del repositorio. Acá se cubre su traducción a Sequelize.

import { Op } from 'sequelize';

const mockSequelize = { transaction: jest.fn(), query: jest.fn() };
const mockMakeModel = (extra: Record<string, unknown> = {}) => ({
  name: 'Fake',
  primaryKeyAttribute: 'id',
  rawAttributes: { id: {}, created_at: {} },
  sequelize: mockSequelize,
  findOne: jest.fn(),
  findAll: jest.fn().mockResolvedValue([]),
  update: jest.fn(),
  count: jest.fn(),
  destroy: jest.fn(),
  ...extra
});

jest.mock('shared/models', () => ({
  ApprovalRequest: mockMakeModel({ STATUS: { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', EXPIRED: 'expired' } }),
  AuditLog: mockMakeModel(),
  SmsDeliveryAttempt: mockMakeModel(),
  User: mockMakeModel(),
  Person: mockMakeModel()
}));

import { mocked } from 'tests/helpers/mock';
import modelsModule from 'shared/models';
const { ApprovalRequest, AuditLog, SmsDeliveryAttempt } = mocked(modelsModule);
import approvalRequestRepository from 'modules/schemas/core/repositories/approval-request.repository';
import auditLogRepository from 'modules/schemas/records/audit/repositories/audit-log.repository';
import smsDeliveryAttemptRepository from 'modules/schemas/notification/repositories/sms-delivery-attempt.repository';

describe('ApprovalRequestRepository — cierre y vencimiento', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolve() actualiza por id y devuelve la solicitud recargada con sus usuarios', async () => {
    const reloaded = { approval_request_id: 'req-1', status: 'approved' };
    ApprovalRequest.update.mockResolvedValue([1]);
    const spy = jest.spyOn(approvalRequestRepository, 'findByIdWithUsers').mockResolvedValue(reloaded as never);
    const changes = { status: 'approved' as const, second_approver_id: 'a-2', resolved_at: new Date(), resolution_notes: null };

    await expect(approvalRequestRepository.resolve('req-1', changes)).resolves.toBe(reloaded);
    expect(ApprovalRequest.update).toHaveBeenCalledWith(changes, { where: { approval_request_id: 'req-1' } });
    expect(spy).toHaveBeenCalledWith('req-1');
    spy.mockRestore();
  });

  it('markExpired() solo marca si sigue pendiente y dice si lo hizo', async () => {
    const now = new Date('2026-01-01T03:00:00Z');
    ApprovalRequest.update.mockResolvedValueOnce([1]).mockResolvedValueOnce([0]);

    await expect(approvalRequestRepository.markExpired('req-1', now)).resolves.toBe(true);
    await expect(approvalRequestRepository.markExpired('req-2', now)).resolves.toBe(false);
    expect(ApprovalRequest.update).toHaveBeenCalledWith(
      { status: 'expired', resolved_at: now },
      { where: { approval_request_id: 'req-1', status: 'pending' } }
    );
  });
});

describe('AuditLogRepository — retención', () => {
  beforeEach(() => jest.clearAllMocks());

  it('countCreatedUpTo (lte) y countCreatedBefore (lt)', async () => {
    const cutoff = new Date('2021-01-01');
    AuditLog.count.mockResolvedValue(7);

    await expect(auditLogRepository.countCreatedUpTo(cutoff)).resolves.toBe(7);
    expect(AuditLog.count).toHaveBeenLastCalledWith({ where: { createdAt: { [Op.lte]: cutoff } } });
    await auditLogRepository.countCreatedBefore(cutoff);
    expect(AuditLog.count).toHaveBeenLastCalledWith({ where: { createdAt: { [Op.lt]: cutoff } } });
  });

  it('purgeCreatedBefore autoriza la purga ante el trigger (SET LOCAL) en la MISMA transacción que el borrado', async () => {
    const cutoff = new Date('2021-01-01');
    const tx = { id: 'tx' };
    mockSequelize.transaction.mockImplementation((work: (t: unknown) => unknown) => work(tx));
    AuditLog.destroy.mockResolvedValue(3);

    await expect(auditLogRepository.purgeCreatedBefore(cutoff)).resolves.toBe(3);
    expect(mockSequelize.query).toHaveBeenCalledWith("SET LOCAL app.allow_audit_purge = 'true'", { transaction: tx });
    expect(AuditLog.destroy).toHaveBeenCalledWith({ where: { createdAt: { [Op.lt]: cutoff } }, force: true, transaction: tx });
  });
});

describe('SmsDeliveryAttemptRepository — countFailedBetween', () => {
  beforeEach(() => jest.clearAllMocks());

  it('con inicio cuenta en la ventana; sin inicio, todo hasta el fin', async () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-01-01T01:00:00Z');
    SmsDeliveryAttempt.count.mockResolvedValue(2);

    await expect(smsDeliveryAttemptRepository.countFailedBetween(from, to)).resolves.toBe(2);
    expect(SmsDeliveryAttempt.count).toHaveBeenLastCalledWith({ where: { status: 'failed', createdAt: { [Op.between]: [from, to] } } });
    await smsDeliveryAttemptRepository.countFailedBetween(null, to);
    expect(SmsDeliveryAttempt.count).toHaveBeenLastCalledWith({ where: { status: 'failed', createdAt: { [Op.lte]: to } } });
  });
});
