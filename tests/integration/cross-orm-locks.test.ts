// tests/integration/cross-orm-locks.test.ts
//
// Regla de la convivencia (docs/prisma-migration.md, fase 5): un INSERT de Prisma con FK a `users`
// dentro de la misma unidad que un UPDATE de Sequelize sobre ese usuario. Son dos conexiones:
//   - UPDATE de una columna sin índice único (is_active): Postgres toma FOR NO KEY UPDATE, compatible
//     con el FOR KEY SHARE de la verificación de la FK → el INSERT pasa.
//   - UPDATE de una columna UNIQUE (username): Postgres toma FOR UPDATE → la verificación de la FK
//     espera a la otra transacción, que espera a esta: bloqueo hasta el timeout.
// Por eso user_change_logs (que se escribe en los flujos que editan el usuario) migra con el grupo 6.

import { randomUUID } from 'node:crypto';
import prisma from '../../shared/database/prisma';
import db from '../../shared/models';

const TAG = `locks-it-${randomUUID().slice(0, 8)}`;
let roleId: string;
let personId: string;
let userId: string;

/** INSERT con FK a users desde Prisma, con lock_timeout corto para no esperar los 15 s de la unidad. */
async function insertChangeLogFromPrisma(): Promise<'ok' | 'lock-timeout'> {
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1000ms'");
      await tx.$executeRawUnsafe(
        `INSERT INTO "${process.env.DB_SCHEMA}".user_change_logs (log_id, user_id, changed_by_role, change_type, created_at)
         VALUES (gen_random_uuid(), $1::uuid, 'system', 'account_status', now())`,
        userId
      );
      // maxWait amplio: con las suites de integración en paralelo el pool puede tardar en dar conexión
    }, { maxWait: 10_000, timeout: 10_000 });
    return 'ok';
  } catch (e) {
    if (String((e as Error).message).includes('55P03')) {
      return 'lock-timeout';
    }
    throw e;
  }
}

describe('Convivencia de ORMs · locks de FK sobre users', () => {
  beforeAll(async () => {
    roleId = (await prisma.role.create({ data: { name: TAG } })).roleId;
    personId = (await prisma.person.create({ data: { firstName: 'P', lastName: TAG } })).personId;
    userId = (await prisma.user.create({ data: { username: TAG, personId, roleId } })).userId;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "${process.env.DB_SCHEMA}".user_change_logs WHERE user_id = $1::uuid`, userId);
    await prisma.user.delete({ where: { userId } });
    await prisma.person.delete({ where: { personId } });
    await prisma.role.delete({ where: { roleId } });
    await prisma.$disconnect();
    await db.sequelize.close();
  });

  it('UPDATE de una columna sin índice único: el INSERT con FK pasa', async () => {
    const t = await db.sequelize.transaction();
    try {
      await db.User.update({ is_active: false }, { where: { user_id: userId }, transaction: t });
      await expect(insertChangeLogFromPrisma()).resolves.toBe('ok');
    } finally {
      await t.rollback();
    }
  });

  it('UPDATE de una columna UNIQUE (username): el INSERT con FK queda esperando el lock', async () => {
    const t = await db.sequelize.transaction();
    try {
      await db.User.update({ username: `${TAG}-x` }, { where: { user_id: userId }, transaction: t });
      await expect(insertChangeLogFromPrisma()).resolves.toBe('lock-timeout');
    } finally {
      await t.rollback();
    }
  });
});
