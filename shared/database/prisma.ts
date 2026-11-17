// shared/database/prisma.ts
//
// Cliente único de Prisma para toda la app (docs/prisma-migration.md). Usa el driver adapter de
// Postgres (`@prisma/adapter-pg`, requerido en Prisma 7) con la MISMA conexión que hoy usa Sequelize:
// variables DB_*, esquema DB_SCHEMA y TLS salvo en localhost (con el bundle CA de RDS si está
// configurado). Durante la migración conviven los dos ORMs contra la misma base.
//
// Solo lo importan los repositorios y shared/database: los services dependen de los repositorios.
// Crear el cliente no abre conexiones: el pool de pg conecta en la primera consulta.
// Los avisos y errores de Prisma van al logger de la app; las consultas, solo con DB_LOGGING=true.
// Sobre el cliente base se aplica piiExtension (shared/database/prisma-extensions.ts): cifrado de PII
// y origen de sesión, lo que en Sequelize hacían los hooks de los modelos.
import fs from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { piiExtension } from './prisma-extensions';
import constantsModule from '../constants';
const { database, server } = constantsModule;
import loggerUtilModule from '../utils/logger.util';
const { logger } = loggerUtilModule;

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

const baseClient = new PrismaClient({
  adapter,
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' }
  ]
});

if (database.logging) {
  baseClient.$on('query', e => logger.debug('prisma:query', { query: e.query, params: e.params, durationMs: e.duration }));
}
baseClient.$on('warn', e => logger.warn('prisma:warn', { message: e.message, target: e.target }));
baseClient.$on('error', e => logger.error('prisma:error', { message: e.message, target: e.target }));

const prisma = baseClient.$extends(piiExtension);

export default prisma;
