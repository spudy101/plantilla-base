// scripts/db-tracking-ts.ts
//
// Las migraciones y seeders pasaron de .js a .ts (fase 6 de docs/typescript-migration.md). sequelize-cli
// registra lo ejecutado por NOMBRE DE ARCHIVO COMPLETO (SequelizeMeta / SequelizeData) y compara con
// igualdad exacta: sin este paso, en una BD existente `20250108000005-create-genders.js` (ejecutada)
// y `20250108000005-create-genders.ts` (en disco) serían distintas → db:migrate volvería a correr
// TODAS las migraciones y fallaría en la primera tabla que ya existe.
//
// Renombra los registros `*.js` → `*.ts` del esquema DB_SCHEMA. Es idempotente (sin registros .js no
// hace nada) y corre antes de cada comando db:* (ver package.json). Se puede eliminar cuando todos los
// entornos hayan corrido una vez una versión con migraciones .ts.
import { QueryTypes } from 'sequelize';
import sequelize = require('../config/config');
import constantsModule = require('../shared/constants');
const { database } = constantsModule;

const TRACKING_TABLES = ['SequelizeMeta', 'SequelizeData'];

async function main(): Promise<void> {
  // El perfil de test es SQLite en memoria: no hay tracking que migrar
  if (sequelize.getDialect() !== 'postgres') {
    return;
  }
  const schema = database.schema || 'public';

  for (const table of TRACKING_TABLES) {
    const [found] = await sequelize.query<{ exists: boolean }>(
      'SELECT to_regclass(:qualified) IS NOT NULL AS "exists"',
      { replacements: { qualified: `"${schema}"."${table}"` }, type: QueryTypes.SELECT }
    );
    if (!found?.exists) {
      continue;
    }
    // `name` es la PK: se salta un .js cuyo .ts ya esté registrado (no debería pasar)
    const renamed = await sequelize.query<{ name: string }>(
      `UPDATE "${schema}"."${table}" AS t
          SET name = left(t.name, length(t.name) - 3) || '.ts'
        WHERE t.name LIKE '%.js'
          AND NOT EXISTS (
            SELECT 1 FROM "${schema}"."${table}" AS o WHERE o.name = left(t.name, length(t.name) - 3) || '.ts'
          )
      RETURNING t.name`,
      { type: QueryTypes.SELECT }
    );
    if (renamed.length > 0) {
      console.log(`[db:tracking] ${table}: ${renamed.length} registros .js → .ts`);
    }
  }
}

main()
  .catch((err: unknown) => {
    console.error('[db:tracking] ERROR:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
