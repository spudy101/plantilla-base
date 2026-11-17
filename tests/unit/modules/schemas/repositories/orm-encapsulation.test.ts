// tests/unit/modules/schemas/repositories/orm-encapsulation.test.ts
//
// Fase 3 de docs/prisma-migration.md: lo que antes hacían services y workers sobre instancias o modelos
// de Sequelize (`AuditLog.destroy`) vive
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
  AuditLog: mockMakeModel()
}));

import { mocked } from 'tests/helpers/mock';
import modelsModule from 'shared/models';
const { AuditLog } = mocked(modelsModule);
import auditLogRepository from 'modules/schemas/records/audit/repositories/audit-log.repository';

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

