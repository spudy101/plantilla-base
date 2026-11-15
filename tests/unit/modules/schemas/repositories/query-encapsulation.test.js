// tests/unit/modules/schemas/repositories/query-encapsulation.test.js
//
// Las consultas con operadores de Sequelize (Op.in, Op.between, Op.gte…) viven en los
// repositorios, no en los services (SOLID: D e I). Aquí se cubre la traducción
// "filtros de negocio → WHERE" que antes estaba repartida en los services.

jest.mock('sequelize', () => ({
  Op: {
    in: Symbol('in'),
    notIn: Symbol('notIn'),
    between: Symbol('between'),
    gte: Symbol('gte'),
    lte: Symbol('lte'),
    and: Symbol('and'),
    or: Symbol('or'),
    iLike: Symbol('iLike')
  },
  QueryTypes: { SELECT: 'SELECT' }
}));

const mockMakeModel = () => ({
  primaryKeyAttribute: 'id',
  rawAttributes: { id: {}, created_at: {} },
  findAll: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
  update: jest.fn().mockResolvedValue([1])
});

jest.mock('shared/models', () => ({
  AuditLog: mockMakeModel(),
  Role: mockMakeModel(),
  Notification: mockMakeModel()
}));

const { Op } = require('sequelize');
const { AuditLog, Role, Notification } = require('shared/models');
const auditLogRepository = require('modules/schemas/records/audit/repositories/audit-log.repository');
const roleRepository = require('modules/schemas/kyc/iam/repositories/role.repository');
const notificationRepository = require('modules/schemas/notification/repositories/notification.repository');

describe('AuditLogRepository — filtros de negocio a WHERE', () => {
  it('buildSearchWhere mapea filtros a columnas y rango de fechas', () => {
    const where = auditLogRepository.buildSearchWhere({
      dateFrom: '2024-01-01',
      dateTo: '2024-02-01',
      action: 'LOGIN',
      userId: 'u-9',
      correlationId: 'c-1',
      module: 'IAM',
      ignored: 'x'
    });
    expect(where).toEqual({
      created_at: { [Op.gte]: '2024-01-01', [Op.lte]: '2024-02-01' },
      action: 'LOGIN',
      user_id: 'u-9',
      correlation_id: 'c-1',
      module: 'IAM'
    });
  });

  it('buildSearchWhere sin filtros devuelve un WHERE vacío', () => {
    expect(auditLogRepository.buildSearchWhere({})).toEqual({});
  });

  it('buildAuthAttemptsWhere con acciones usa IN y no filtra por categoría', () => {
    const from = new Date('2024-01-01');
    const to = new Date('2024-01-31');
    const where = auditLogRepository.buildAuthAttemptsWhere({
      from,
      to,
      actions: ['LOGIN_SUCCESS', 'LOGIN_FAILED'],
      category: 'Autenticación',
      userId: 'u-1',
      outcome: 'FAILED'
    });
    expect(where).toEqual({
      created_at: { [Op.between]: [from, to] },
      action: { [Op.in]: ['LOGIN_SUCCESS', 'LOGIN_FAILED'] },
      user_id: 'u-1',
      outcome: 'FAILED'
    });
  });

  it('buildAuthAttemptsWhere sin acciones filtra por categoría', () => {
    const from = new Date('2024-01-01');
    const to = new Date('2024-01-31');
    expect(auditLogRepository.buildAuthAttemptsWhere({ from, to, category: 'Autenticación' })).toEqual({
      created_at: { [Op.between]: [from, to] },
      category: 'Autenticación'
    });
  });

  it('searchPaginated consulta con el WHERE traducido', async () => {
    await auditLogRepository.searchPaginated({ action: 'LOGIN' }, { limit: 10, offset: 0 }, []);
    expect(AuditLog.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { action: 'LOGIN' }, limit: 10, offset: 0 })
    );
  });

  it('es append-only: no expone update ni delete', () => {
    expect(auditLogRepository.update).toBeUndefined();
    expect(auditLogRepository.delete).toBeUndefined();
  });
});

describe('RoleRepository.findByNames', () => {
  it('filtra por IN', async () => {
    await roleRepository.findByNames(['cliente']);
    expect(Role.findAll).toHaveBeenCalledWith({ where: { name: { [Op.in]: ['cliente'] } } });
  });

  it('con exclude agrega NOT IN', async () => {
    await roleRepository.findByNames(['admin', 'superadmin'], { exclude: ['superadmin'] });
    expect(Role.findAll).toHaveBeenCalledWith({
      where: { name: { [Op.in]: ['admin', 'superadmin'], [Op.notIn]: ['superadmin'] } }
    });
  });
});

describe('NotificationRepository.markAsReadByIds', () => {
  it('marca como leídas solo las no leídas de los IDs indicados', async () => {
    await notificationRepository.markAsReadByIds(['n-1', 'n-2'], { transaction: 'tx' });
    expect(Notification.update).toHaveBeenCalledWith(
      { is_read: true, read_at: expect.any(Date) },
      { where: { notification_id: { [Op.in]: ['n-1', 'n-2'] }, is_read: false }, transaction: 'tx' }
    );
  });
});
