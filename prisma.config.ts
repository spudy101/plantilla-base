// prisma.config.ts — configuración del CLI de Prisma (db pull, migrate, generate, studio).
// La URL se arma desde las variables DB_* de siempre (shared/database/database-url.ts). `prisma generate`
// no la necesita (en CI no hay base): sin DB_HOST se omite y los comandos que sí la usan lo dicen.
// Ver docs/prisma-migration.md.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { databaseUrl } from './shared/database/database-url';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations'
  },
  ...(process.env.DB_HOST ? { datasource: { url: databaseUrl() } } : {})
});
