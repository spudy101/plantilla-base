// tests/integration/unit-of-work.test.ts
//
// Unit of Work contra Postgres real (esquema aislado de tests/test-env.ts; `npm run db:test:prepare`).
// Verifica la convivencia de la fase 2 de docs/prisma-migration.md: dentro de unitOfWork.run() una
// escritura de Sequelize (con la transacción que recibe work) y una de Prisma (tomada del contexto, como
// hace PrismaRepository) se confirman juntas o se revierten juntas, y fuera de run() no se ven a medias.

import { randomUUID } from 'node:crypto';
import unitOfWork from '../../shared/database/unit-of-work';
import txContext from '../../shared/database/transaction-context';
import prisma from '../../shared/database/prisma';
import db from '../../shared/models';

const PREFIX = `uow-it-${randomUUID().slice(0, 8)}`;

async function namesInDb(): Promise<string[]> {
  const rows = await prisma.gender.findMany({ where: { name: { startsWith: PREFIX } }, orderBy: { name: 'asc' } });
  return rows.map(r => r.name);
}

describe('Unit of Work · Sequelize + Prisma contra Postgres', () => {
  afterEach(async () => {
    await prisma.gender.deleteMany({ where: { name: { startsWith: PREFIX } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await db.sequelize.close();
  });

  it('confirma juntas una escritura de Sequelize y una de Prisma', async () => {
    await unitOfWork.run(async transaction => {
      await db.Gender.create({ name: `${PREFIX}-sequelize` }, { transaction });
      const tx = await txContext.activeUnit()!.prisma();
      await tx.gender.create({ data: { name: `${PREFIX}-prisma` } });
    });

    expect(await namesInDb()).toEqual([`${PREFIX}-prisma`, `${PREFIX}-sequelize`]);
  });

  it('si el trabajo lanza, no queda ninguna de las dos', async () => {
    await expect(
      unitOfWork.run(async transaction => {
        await db.Gender.create({ name: `${PREFIX}-sequelize` }, { transaction });
        const tx = await txContext.activeUnit()!.prisma();
        await tx.gender.create({ data: { name: `${PREFIX}-prisma` } });
        throw new Error('regla de negocio');
      })
    ).rejects.toThrow('regla de negocio');

    expect(await namesInDb()).toEqual([]);
  });

  it('lo escrito por Prisma dentro de run() no se ve desde afuera hasta el commit', async () => {
    let seenOutside: string[] = ['sin consultar'];
    await unitOfWork.run(async () => {
      const tx = await txContext.activeUnit()!.prisma();
      await tx.gender.create({ data: { name: `${PREFIX}-pendiente` } });
      seenOutside = await namesInDb(); // cliente único: otra conexión, fuera de la transacción
    });

    expect(seenOutside).toEqual([]);
    expect(await namesInDb()).toEqual([`${PREFIX}-pendiente`]);
  });
});
