// tests/unit/shared/repositories/repository-hierarchy.test.ts
//
// Jerarquía de repositorios (SOLID: L e I):
//   ReadRepository → BaseRepository (CRUD) / AppendOnlyRepository (solo inserción)
// Verificamos que cada clase expone SOLO lo que promete y que `findByIds`
// encapsula el operador IN de Sequelize.

jest.mock('sequelize', () => ({
  Op: { in: Symbol('in'), and: Symbol('and'), or: Symbol('or'), iLike: Symbol('iLike') }
}));

import { mocked, fixture } from 'tests/helpers/mock';
import sequelizeModule from 'sequelize';
const { Op } = mocked(sequelizeModule);
import ReadRepository from 'shared/repositories/read.repository';
import BaseRepository from 'shared/repositories/base.repository';
import AppendOnlyRepository from 'shared/repositories/append-only.repository';

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
    const repo = new BaseRepository(fixture(fakeModel()));
    expect(repo).toBeInstanceOf(ReadRepository);
    for (const m of ['findById', 'findAll', 'findByIds', 'create', 'update', 'delete', 'bulkUpdate', 'bulkDelete']) {
      expect(typeof (repo as unknown as Record<string, unknown>)[m]).toBe('function');
    }
  });

  it('AppendOnlyRepository es un ReadRepository que solo inserta (sin update/delete)', () => {
    const repo = new AppendOnlyRepository(fixture(fakeModel()));
    expect(repo).toBeInstanceOf(ReadRepository);
    expect(repo).not.toBeInstanceOf(BaseRepository);
    expect(typeof repo.create).toBe('function');
    expect(typeof repo.bulkCreate).toBe('function');
    // los métodos de escritura no existen en el tipo: se mira el objeto en tiempo de ejecución
    const loose = repo as unknown as Record<string, unknown>;
    expect(loose.update).toBeUndefined();
    expect(loose.delete).toBeUndefined();
    expect(loose.bulkUpdate).toBeUndefined();
    expect(loose.bulkDelete).toBeUndefined();
  });

  it('AppendOnlyRepository.create propaga data y options al modelo', async () => {
    const model = fakeModel();
    const repo = new AppendOnlyRepository(fixture(model));
    await repo.create({ a: 1 }, fixture({ transaction: 'tx' }));
    expect(model.create).toHaveBeenCalledWith({ a: 1 }, { transaction: 'tx' });
  });

  describe('ReadRepository.findByIds', () => {
    it('usa la PK del modelo por defecto y arma el IN internamente', async () => {
      const model = fakeModel();
      const repo = new ReadRepository(fixture(model));
      await repo.findByIds([1, 2]);
      expect(model.findAll).toHaveBeenCalledWith({ where: { thing_id: { [Op.in]: [1, 2] } } });
    });

    it('permite indicar otra columna y opciones', async () => {
      const model = fakeModel();
      const repo = new ReadRepository(fixture(model));
      await repo.findByIds(['a'], 'other_id', fixture({ transaction: 'tx' }));
      expect(model.findAll).toHaveBeenCalledWith({ where: { other_id: { [Op.in]: ['a'] } }, transaction: 'tx' });
    });

    it('con lista vacía no consulta la BD', async () => {
      const model = fakeModel();
      const repo = new ReadRepository(fixture(model));
      await expect(repo.findByIds([])).resolves.toEqual([]);
      expect(model.findAll).not.toHaveBeenCalled();
    });
  });
});
