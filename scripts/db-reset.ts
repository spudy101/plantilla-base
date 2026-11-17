// Reset de BD acotado al esquema del template (DB_SCHEMA).
//
// En vez de `migrate:undo:all` (que depende de la cadena de down() y en Postgres se rompe por los
// enum types con dependencias — ver docs/database.md), dropea y recrea el ESQUEMA completo y vuelve
// a aplicar migraciones + seeders desde cero. Como el tracking (SequelizeMeta/SequelizeData) vive
// dentro del esquema, dropear el esquema también resetea el tracking.
//
// GUARDA DE SEGURIDAD: esta instancia Postgres puede compartirse entre varios esquemas (p. ej. el
// template en `plantilla` y un proyecto real en otro). Por eso se niega a correr si DB_SCHEMA está
// vacío o es `public`, para no arrastrar tablas de esquemas vecinos.
import childProcessModule from 'node:child_process';
const { execSync } = childProcessModule;
import sequelize from '../config/config';
import constantsModule from '../shared/constants';
const { database } = constantsModule;

const SCHEMA = database.schema;

async function main(): Promise<void> {
  if (!SCHEMA || SCHEMA === 'public') {
    console.error(`[db:reset] DB_SCHEMA inseguro o vacío ("${SCHEMA}"). Abortado para no tocar esquemas compartidos.`);
    process.exit(1);
  }

  console.log(`[db:reset] Reseteando esquema "${SCHEMA}"...`);
  await sequelize.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await sequelize.query(`CREATE SCHEMA "${SCHEMA}"`);
  await sequelize.close();

  console.log('[db:reset] Esquema recreado. Aplicando migraciones...');
  execSync('npm run db:migrate', { stdio: 'inherit' });

  console.log('[db:reset] Aplicando seeders...');
  execSync('npm run db:seed', { stdio: 'inherit' });

  console.log('[db:reset] OK — esquema reconstruido, migraciones y seeders aplicados.');
}

main().catch((err: unknown) => {
  console.error('[db:reset] ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
