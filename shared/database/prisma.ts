// shared/database/prisma.ts
//
// Cliente único de Prisma para toda la app (docs/prisma-migration.md). Usa el driver adapter de
// Postgres (`@prisma/adapter-pg`, requerido en Prisma 7) con la MISMA conexión que hoy usa Sequelize:
// variables DB_*, esquema DB_SCHEMA y TLS salvo en localhost (con el bundle CA de RDS si está
// configurado). Durante la migración conviven los dos ORMs contra la misma base.
//
// Solo lo importan los repositorios y shared/database: los services dependen de los repositorios.
// Crear el cliente no abre conexiones: el pool de pg conecta en la primera consulta.
import fs from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import constantsModule from '../constants';
const { database, server } = constantsModule;

function sslConfig() {
  if (server.localhost === 'true') {
    return undefined;
  }
  return database.rdsCaBundlePath
    ? { rejectUnauthorized: true, ca: fs.readFileSync(database.rdsCaBundlePath, 'utf8') }
    : { rejectUnauthorized: false };
}

const adapter = new PrismaPg(
  {
    host: database.host,
    port: database.port,
    database: database.name,
    user: database.user,
    password: database.password,
    ssl: sslConfig()
  },
  { schema: database.schema || 'public' }
);

const prisma = new PrismaClient({
  adapter,
  log: database.logging ? ['query', 'warn', 'error'] : ['warn', 'error']
});

export default prisma;
