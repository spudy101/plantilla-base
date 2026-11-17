// shared/database/database-health.ts
//
// Chequeo de la base para /health. Mientras dura la migración a Prisma (docs/prisma-migration.md)
// conviven dos clientes con pools propios: la base está sana solo si responden los dos.
// Ninguno de los dos lanza hacia arriba un detalle de conexión: el llamador decide qué exponer.
import prisma from './prisma';
import modelsModule from '../models';

/** Lanza si alguno de los clientes no puede consultar la base. */
export async function checkDatabase(): Promise<void> {
  await Promise.all([modelsModule.sequelize.authenticate(), prisma.$queryRaw`SELECT 1`]);
}

/** Cierra los pools (shutdown ordenado). */
export async function closeDatabase(): Promise<void> {
  await Promise.all([modelsModule.sequelize.close(), prisma.$disconnect()]);
}

export default { checkDatabase, closeDatabase };
