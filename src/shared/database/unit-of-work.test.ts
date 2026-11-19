// tests/unit/shared/database/unit-of-work.test.ts
//
// Unit of Work (SOLID: D): los services piden unidades de trabajo a este puerto y no al ORM. run() abre
// una transacción interactiva de Prisma y la publica en transaction-context para los repositorios.

jest.mock('./prisma', () => ({ __esModule: true, default: { $transaction: jest.fn() } }));

import { mocked, fixture } from 'tests/helpers/mock';
import { managedTransaction } from 'tests/helpers/transaction';
import prismaModule from './prisma';
const prisma = mocked(prismaModule);
import unitOfWork from './unit-of-work';
const { PrismaUnitOfWork } = unitOfWork;
import txContext from './transaction-context';

/** Prisma falso: `$transaction(fn)` le da `txClient` a fn y termina cuando fn termina. */
function fakePrisma(events: string[] = []) {
  const txClient = { id: 'prisma-tx' };
  const client = {
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
  return { client, txClient };
}

describe('PrismaUnitOfWork', () => {
  beforeEach(() => jest.clearAllMocks());

  it('run(work) usa el cliente único por defecto, con los timeouts y las opciones del llamador', async () => {
    const tx = { commit: jest.fn(), rollback: jest.fn() };
    prisma.$transaction.mockImplementation(managedTransaction(tx));
    const work = jest.fn().mockResolvedValue('ok');

    await expect(unitOfWork.run(work, fixture({ isolationLevel: 'Serializable' }))).resolves.toBe('ok');
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable', maxWait: 5_000, timeout: 15_000 })
    );
    expect(work).toHaveBeenCalledTimes(1);
    expect(tx.commit).toHaveBeenCalled();
  });

  it('dentro de run() la unidad activa entrega el cliente de la transacción', async () => {
    const { client, txClient } = fakePrisma();
    const uow = new PrismaUnitOfWork(fixture({ prisma: client }));

    const clients = await uow.run(async () => {
      const unit = txContext.activeUnit();
      return Promise.all([unit!.prisma(), unit!.prisma()]);
    });

    expect(clients).toEqual([txClient, txClient]);
    expect(client.$transaction).toHaveBeenCalledTimes(1);
  });

  it('si work lanza, Prisma revierte y el error llega al llamador', async () => {
    const events: string[] = [];
    const { client } = fakePrisma(events);
    const uow = new PrismaUnitOfWork(fixture({ prisma: client }));

    await expect(
      uow.run(async () => {
        events.push('work');
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(events).toEqual(['prisma:open', 'work', 'prisma:rollback']);
  });

  it('un run() anidado se une a la unidad activa (no abre otra transacción)', async () => {
    const { client, txClient } = fakePrisma();
    const uow = new PrismaUnitOfWork(fixture({ prisma: client }));

    const inner = await uow.run(() => uow.run(async () => txContext.activeUnit()!.prisma()));

    expect(inner).toBe(txClient);
    expect(client.$transaction).toHaveBeenCalledTimes(1);
  });

  it('fuera de run() no hay unidad activa', () => {
    expect(txContext.activeUnit()).toBeNull();
  });

  it('lo que work dejó en segundo plano ya no ve la unidad (no usa una transacción cerrada)', async () => {
    const { client } = fakePrisma();
    const uow = new PrismaUnitOfWork(fixture({ prisma: client }));
    let late: Promise<unknown> | null = null;

    await uow.run(async () => {
      late = new Promise(resolve => {
        setImmediate(() => resolve(txContext.activeUnit()));
      });
    });

    await expect(late).resolves.toBeNull();
  });
});
