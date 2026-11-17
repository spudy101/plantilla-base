// tests/unit/modules/schemas/repositories.regressions.test.ts
//
// Regresiones de bugs que destapó el tipado de los repositorios (fase 3 de la migración a TS).
// Los modelos se reemplazan por dobles: se verifica la lógica del repositorio, no Sequelize.

const fakeModel = (extra: Record<string, unknown> = {}) => ({
  name: 'Fake',
  primaryKeyAttribute: 'id',
  rawAttributes: { id: {}, created_at: {} },
  findOne: jest.fn(),
  findAll: jest.fn(),
  findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
  create: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn(),
  ...extra
});

const mockModels = {
  AuditLog: fakeModel(),
  UserChangeLog: fakeModel(),
  UserTrustedDevice: fakeModel()
};

jest.mock('shared/models', () => mockModels);
jest.mock('shared/utils/logger.util', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));

import auditLogRepository from 'modules/schemas/records/audit/repositories/audit-log.repository';
import userChangeLogRepository from 'modules/schemas/records/audit/repositories/user-change-log.repository';

beforeEach(() => jest.clearAllMocks());

describe('AuditLogRepository.register', () => {
  // Antes: el try/catch envolvía una Promise sin await → el rechazo escapaba al llamador pese a
  // que el contrato es "nunca lanza".
  it('no propaga el error de BD: devuelve null', async () => {
    mockModels.AuditLog.create.mockRejectedValue(new Error('db down'));

    await expect(auditLogRepository.register({ action: 'LOGIN', user_id: 'u-1' })).resolves.toBeNull();
  });

  it('devuelve el registro creado', async () => {
    mockModels.AuditLog.create.mockResolvedValue({ audit_log_id: 'a-1' });

    await expect(auditLogRepository.register({ action: 'LOGIN' })).resolves.toEqual({ audit_log_id: 'a-1' });
  });
});

describe('UserChangeLogRepository: filtros de los atajos', () => {
  // Antes: findByChangeType / findByAdminUser pasaban claves snake_case que findAllPaginated no lee,
  // así que el filtro se perdía y devolvían los logs de todos.
  const whereOfLastQuery = () => JSON.stringify(mockModels.UserChangeLog.findAndCountAll.mock.calls.at(-1)[0].where);

  it('findByChangeType filtra por change_type', async () => {
    await userChangeLogRepository.findByChangeType('email');
    expect(whereOfLastQuery()).toContain('"change_type":"email"');
  });

  it('findByAdminUser filtra por changed_by_user_id y rol admin', async () => {
    await userChangeLogRepository.findByAdminUser('admin-1');
    const where = whereOfLastQuery();
    expect(where).toContain('"changed_by_user_id":"admin-1"');
    expect(where).toContain('"changed_by_role":"admin"');
  });
});

