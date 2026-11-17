// tests/unit/shared/database/unit-of-work.test.ts
//
// Unit of Work (SOLID: D): los services piden transacciones a este puerto y no a Sequelize.

jest.mock('shared/models', () => ({ sequelize: { transaction: jest.fn() } }));

import { mocked, Loose, fixture } from 'tests/helpers/mock';
import modelsModule = require('shared/models');
const { sequelize } = mocked(modelsModule);
import unitOfWork = require('shared/database/unit-of-work');
const { SequelizeUnitOfWork } = unitOfWork;

describe('SequelizeUnitOfWork', () => {
  it('begin() delega en sequelize.transaction() con los mismos argumentos', async () => {
    const tx = { commit: jest.fn(), rollback: jest.fn() };
    sequelize.transaction.mockResolvedValue(tx);

    await expect(unitOfWork.begin()).resolves.toBe(tx);
    expect(sequelize.transaction).toHaveBeenCalledWith();
  });

  it('run(work) usa una transacción gestionada (commit/rollback automáticos)', async () => {
    sequelize.transaction.mockImplementation((options: Loose, work: Loose) => work('tx-1'));
    const work = jest.fn().mockResolvedValue('ok');

    await expect(unitOfWork.run(work)).resolves.toBe('ok');
    expect(sequelize.transaction).toHaveBeenCalledWith({}, work);
    expect(work).toHaveBeenCalledWith('tx-1');
  });

  it('acepta una instancia de Sequelize inyectada (útil en tests o con otra conexión)', async () => {
    const fakeSequelize = { transaction: jest.fn().mockResolvedValue('tx-fake') };
    const uow = new SequelizeUnitOfWork(fixture({ sequelize: fakeSequelize }));

    await expect(uow.begin()).resolves.toBe('tx-fake');
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });
});
