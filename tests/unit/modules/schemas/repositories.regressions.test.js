// tests/unit/modules/schemas/repositories.regressions.test.js
//
// Regresiones de bugs que destapó el tipado de los repositorios (fase 3 de la migración a TS).
// Los modelos se reemplazan por dobles: se verifica la lógica del repositorio, no Sequelize.

const fakeModel = extra => ({
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
  UserPushToken: fakeModel(),
  AuditLog: fakeModel(),
  UserChangeLog: fakeModel(),
  VerificationCode: fakeModel(),
  UserTrustedDevice: fakeModel()
};

jest.mock('shared/models', () => mockModels);
jest.mock('shared/utils/logger.util', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));

const userPushTokenRepository = require('modules/schemas/notification/repositories/user-push-token.repository');
const auditLogRepository = require('modules/schemas/records/audit/repositories/audit-log.repository');
const userChangeLogRepository = require('modules/schemas/records/audit/repositories/user-change-log.repository');
const verificationCodeRepository = require('modules/schemas/notification/repositories/verification-code.repository');

beforeEach(() => jest.clearAllMocks());

describe('UserPushTokenRepository.upsertToken', () => {
  // Antes: findByDeviceId/findByToken sin await → `existing` era una Promise (truthy) y
  // existing.update() lanzaba TypeError; el login lo tragaba y el token nunca se guardaba.
  it('actualiza el token existente del dispositivo', async () => {
    const existing = { update: jest.fn().mockResolvedValue('updated') };
    mockModels.UserPushToken.findOne.mockResolvedValueOnce(existing);

    const result = await userPushTokenRepository.upsertToken('u-1', 'arn:token', 'android', 'dev-1');

    expect(result).toBe('updated');
    expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u-1', token: 'arn:token', device_id: 'dev-1' }));
    expect(mockModels.UserPushToken.create).not.toHaveBeenCalled();
  });

  it('cae a la búsqueda por token y, si no hay registro, crea uno nuevo', async () => {
    mockModels.UserPushToken.findOne.mockResolvedValue(null);
    mockModels.UserPushToken.create.mockResolvedValue('created');

    const result = await userPushTokenRepository.upsertToken('u-1', 'arn:token', 'ios', 'dev-1');

    expect(result).toBe('created');
    expect(mockModels.UserPushToken.findOne).toHaveBeenCalledTimes(2);
    expect(mockModels.UserPushToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u-1', token: 'arn:token', platform: 'ios' }),
      {}
    );
  });
});

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

describe('VerificationCodeRepository.incrementAttempts', () => {
  // Antes no aceptaba opciones: el incremento corría fuera de la transacción del llamador.
  it('propaga la transacción al update', async () => {
    mockModels.VerificationCode.update.mockResolvedValue([1]);
    const tx = { id: 'tx' };

    await verificationCodeRepository.incrementAttempts('vc-1', { transaction: tx });

    expect(mockModels.VerificationCode.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ transaction: tx, where: expect.objectContaining({ verification_code_id: 'vc-1' }) })
    );
  });
});
