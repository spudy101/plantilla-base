// tests/unit/shared/database/unit-of-work.test.ts
//
// Unit of Work (SOLID: D): los services piden unidades de trabajo a este puerto y no al ORM.
// Fase 2 de docs/prisma-migration.md: run() abre la transacción de Sequelize y, si un repositorio
// Prisma la pide, una interactiva de Prisma (perezosa) que se publica en transaction-context.

jest.mock('shared/models', () => ({ sequelize: { transaction: jest.fn() } }));

import { mocked, fixture } from 'tests/helpers/mock';
import { managedTransaction } from 'tests/helpers/transaction';
import modelsModule from 'shared/models';
const { sequelize } = mocked(modelsModule);
import unitOfWork from 'shared/database/unit-of-work';
const { SequelizeUnitOfWork } = unitOfWork;
import txContext from 'shared/database/transaction-context';

/** Prisma falso: `$transaction(fn)` le da `txClient` a fn y termina cuando fn termina. */
function fakePrisma(events: string[] = []) {
  const txClient = { id: 'prisma-tx' };
  const prisma = {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      events.push('prisma:open');
      try {
        const r = await fn(txClient);
        events.push('prisma:commit');
        return r;
      } catch (e) {
        events.push('prisma:rollback');
        throw e;
      }
    })
  };
  return { prisma, txClient };
}

function sequelizeTx(events: string[] = []) {
  return {
    id: 'sequelize-tx',
    commit: jest.fn(async () => { events.push('sequelize:commit'); }),
    rollback: jest.fn(async () => { events.push('sequelize:rollback'); })
  };
}

describe('SequelizeUnitOfWork', () => {
  beforeEach(() => jest.clearAllMocks());

  it('run(work) abre una transacción gestionada de Sequelize, le pasa la transacción a work y devuelve su resultado', async () => {
    const tx = sequelizeTx();
    sequelize.transaction.mockImplementation(managedTransaction(tx));
    const work = jest.fn().mockResolvedValue('ok');

    await expect(unitOfWork.run(work, fixture({ isolationLevel: 'SERIALIZABLE' }))).resolves.toBe('ok');
    expect(sequelize.transaction).toHaveBeenCalledWith({ isolationLevel: 'SERIALIZABLE' }, expect.any(Function));
    expect(work).toHaveBeenCalledWith(tx);
    expect(tx.commit).toHaveBeenCalled();
  });

  it('si ningún repositorio Prisma la pide, no abre transacción de Prisma (sin segunda conexión)', async () => {
    const { prisma } = fakePrisma();
    const uow = new SequelizeUnitOfWork(fixture({ sequelize: { transaction: managedTransaction(sequelizeTx()) }, prisma }));

    await uow.run(async () => 'listo');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('un repositorio Prisma dentro de run() recibe el cliente de la transacción; se abre una sola vez', async () => {
    const { prisma, txClient } = fakePrisma();
    const uow = new SequelizeUnitOfWork(fixture({ sequelize: { transaction: managedTransaction(sequelizeTx()) }, prisma }));

    const clients = await uow.run(async () => {
      const unit = txContext.activeUnit();
      return Promise.all([unit!.prisma(), unit!.prisma()]);
    });

    expect(clients).toEqual([txClient, txClient]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ timeout: 15_000 }));
  });

  it('confirma primero la de Prisma y después la de Sequelize', async () => {
    const events: string[] = [];
    const { prisma } = fakePrisma(events);
    const uow = new SequelizeUnitOfWork(fixture({ sequelize: { transaction: managedTransaction(sequelizeTx(events)) }, prisma }));

    await uow.run(async () => {
      await txContext.activeUnit()!.prisma();
      events.push('work');
    });

    expect(events).toEqual(['prisma:open', 'work', 'prisma:commit', 'sequelize:commit']);
  });

  it('si work lanza, revierte las dos y propaga el error de work', async () => {
    const events: string[] = [];
    const { prisma } = fakePrisma(events);
    const uow = new SequelizeUnitOfWork(fixture({ sequelize: { transaction: managedTransaction(sequelizeTx(events)) }, prisma }));

    await expect(
      uow.run(async () => {
        await txContext.activeUnit()!.prisma();
        throw new Error('regla de negocio');
      })
    ).rejects.toThrow('regla de negocio');

    expect(events).toEqual(['prisma:open', 'prisma:rollback', 'sequelize:rollback']);
  });

  it('un run() dentro de otro se une a la unidad activa (misma transacción, no abre otra)', async () => {
    const tx = sequelizeTx();
    const transaction = jest.fn(managedTransaction(tx));
    const uow = new SequelizeUnitOfWork(fixture({ sequelize: { transaction }, prisma: fakePrisma().prisma }));

    const inner = await uow.run(async outerTx => uow.run(async innerTx => [outerTx, innerTx]));

    expect(inner).toEqual([tx, tx]);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('fuera de run() no hay unidad activa', async () => {
    expect(txContext.activeUnit()).toBeNull();
    const uow = new SequelizeUnitOfWork(fixture({ sequelize: { transaction: managedTransaction(sequelizeTx()) } }));
    await uow.run(async () => expect(txContext.activeUnit()).not.toBeNull());
    expect(txContext.activeUnit()).toBeNull();
  });

  it('acepta una instancia de Sequelize inyectada (útil en tests o con otra conexión)', async () => {
    const fakeSequelize = { transaction: jest.fn(managedTransaction(sequelizeTx())) };
    const uow = new SequelizeUnitOfWork(fixture({ sequelize: fakeSequelize }));

    await expect(uow.run(async () => 'ok')).resolves.toBe('ok');
    expect(fakeSequelize.transaction).toHaveBeenCalled();
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });
});
