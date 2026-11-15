// tests/unit/shared/repositories/repository-hierarchy.test.js
//
// Jerarquía de repositorios (SOLID: L e I):
//   ReadRepository → BaseRepository (CRUD) / AppendOnlyRepository (solo inserción)
// Verificamos que cada clase expone SOLO lo que promete y que `findByIds`
// encapsula el operador IN de Sequelize.

jest.mock('sequelize', () => ({
  Op: { in: Symbol('in'), and: Symbol('and'), or: Symbol('or'), iLike: Symbol('iLike') }
}));

const { Op } = require('sequelize');
const ReadRepository = require('shared/repositories/read.repository');
const BaseRepository = require('shared/repositories/base.repository');
const AppendOnlyRepository = require('shared/repositories/append-only.repository');

const fakeModel = () => ({
  primaryKeyAttribute: 'thing_id',
  rawAttributes: { thing_id: {}, created_at: {} },
  findAll: jest.fn().mockResolvedValue([{ thing_id: 1 }]),
  findOne: jest.fn(),
  create: jest.fn().mockResolvedValue({ thing_id: 1 }),
  bulkCreate: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn()
});

describe('Jerarquía de repositorios', () => {
  it('BaseRepository es un ReadRepository con escrituras completas', () => {
    const repo = new BaseRepository(fakeModel());
    expect(repo).toBeInstanceOf(ReadRepository);
    for (const m of ['findById', 'findAll', 'findByIds', 'create', 'update', 'delete', 'bulkUpdate', 'bulkDelete']) {
      expect(typeof repo[m]).toBe('function');
    }
  });

  it('AppendOnlyRepository es un ReadRepository que solo inserta (sin update/delete)', () => {
    const repo = new AppendOnlyRepository(fakeModel());
    expect(repo).toBeInstanceOf(ReadRepository);
    expect(repo).not.toBeInstanceOf(BaseRepository);
    expect(typeof repo.create).toBe('function');
    expect(typeof repo.bulkCreate).toBe('function');
    expect(repo.update).toBeUndefined();
    expect(repo.delete).toBeUndefined();
    expect(repo.bulkUpdate).toBeUndefined();
    expect(repo.bulkDelete).toBeUndefined();
  });

  it('AppendOnlyRepository.create propaga data y options al modelo', async () => {
    const model = fakeModel();
    const repo = new AppendOnlyRepository(model);
    await repo.create({ a: 1 }, { transaction: 'tx' });
    expect(model.create).toHaveBeenCalledWith({ a: 1 }, { transaction: 'tx' });
  });

  describe('ReadRepository.findByIds', () => {
    it('usa la PK del modelo por defecto y arma el IN internamente', async () => {
      const model = fakeModel();
      const repo = new ReadRepository(model);
      await repo.findByIds([1, 2]);
      expect(model.findAll).toHaveBeenCalledWith({ where: { thing_id: { [Op.in]: [1, 2] } } });
    });

    it('permite indicar otra columna y opciones', async () => {
      const model = fakeModel();
      const repo = new ReadRepository(model);
      await repo.findByIds(['a'], 'other_id', { transaction: 'tx' });
      expect(model.findAll).toHaveBeenCalledWith({ where: { other_id: { [Op.in]: ['a'] } }, transaction: 'tx' });
    });

    it('con lista vacía no consulta la BD', async () => {
      const model = fakeModel();
      const repo = new ReadRepository(model);
      await expect(repo.findByIds([])).resolves.toEqual([]);
      expect(model.findAll).not.toHaveBeenCalled();
    });
  });
});
