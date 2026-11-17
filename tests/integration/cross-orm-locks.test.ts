// tests/integration/cross-orm-locks.test.ts
//
// Regla de la convivencia (docs/prisma-migration.md, fase 5): mientras `users` estaba en Sequelize, un
// INSERT de Prisma en user_change_logs (FK a users) dentro de la misma unidad que un UPDATE de una
// columna UNIQUE del usuario (username, al eliminar la cuenta) esperaba el lock de la otra conexión
// hasta el timeout. Con el grupo 6 los dos van por la transacción de Prisma de la unidad: misma
// conexión, sin espera, y se confirman o revierten juntos.
//
// user_change_logs es append-only (trigger: ni UPDATE ni DELETE, tampoco en cascada), así que las
// filas de esta suite quedan en el esquema de test (db:test:prepare lo reconstruye).

import { randomUUID } from 'node:crypto';
import prisma from '../../shared/database/prisma';
import db from '../../shared/models';
import unitOfWork from '../../shared/database/unit-of-work';
import userRepository from '../../modules/schemas/kyc/iam/repositories/user.repository';
import userChangeLogRepository from '../../modules/schemas/records/audit/repositories/user-change-log.repository';

const TAG = `locks-it-${randomUUID().slice(0, 8)}`;
let userId: string;

const changeLogsOf = () => prisma.userChangeLog.count({ where: { userId } });

describe('Grupo 6 · usuario y su change-log en la misma unidad (Prisma)', () => {
  beforeAll(async () => {
    const { roleId } = await prisma.role.create({ data: { name: TAG } });
    const { personId } = await prisma.person.create({ data: { firstName: 'P', lastName: TAG } });
    userId = (await prisma.user.create({ data: { username: TAG, personId, roleId } })).userId;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await db.sequelize.close();
  });

  it('UPDATE de una columna UNIQUE + INSERT con FK al usuario: confirma sin esperar locks', async () => {
    const renamed = `${TAG}-renamed`;
    const started = Date.now();

    await unitOfWork.run(async () => {
      await userRepository.update(userId, { username: renamed });
      await userChangeLogRepository.createLog({ userId, changedByRole: 'system', changeType: 'account_status' });
    });

    // Antes: lock-timeout (la FK esperaba a la transacción de Sequelize). Ahora, una sola conexión.
    expect(Date.now() - started).toBeLessThan(5_000);
    await expect(prisma.user.findUnique({ where: { userId } })).resolves.toMatchObject({ username: renamed });
    await expect(changeLogsOf()).resolves.toBe(1);
  });

  it('si la unidad falla, se revierten el cambio del usuario y su registro', async () => {
    const before = await changeLogsOf();

    await expect(
      unitOfWork.run(async () => {
        await userRepository.update(userId, { username: `${TAG}-rollback` });
        await userChangeLogRepository.createLog({ userId, changedByRole: 'system', changeType: 'account_status' });
        throw new Error('falla de negocio');
      })
    ).rejects.toThrow('falla de negocio');

    await expect(prisma.user.findUnique({ where: { userId } })).resolves.toMatchObject({ username: `${TAG}-renamed` });
    await expect(changeLogsOf()).resolves.toBe(before);
  });
});
