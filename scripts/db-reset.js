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
const { execSync } = require('node:child_process');
const sequelize = require('../config/config');
const { database } = require('../shared/constants');

const SCHEMA = database.schema;

async function main() {
  if (!SCHEMA || SCHEMA === 'public') {
    console.error(`[db:reset] DB_SCHEMA inseguro o vacío ("${SCHEMA}"). Abortado para no tocar esquemas compartidos.`);
    process.exit(1);
  }

  console.log(`[db:reset] Reseteando esquema "${SCHEMA}"...`);
  await sequelize.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await sequelize.query(`CREATE SCHEMA "${SCHEMA}"`);
  await sequelize.close();

  console.log('[db:reset] Esquema recreado. Aplicando migraciones...');
  execSync('npx sequelize-cli db:migrate', { stdio: 'inherit' });

  console.log('[db:reset] Aplicando seeders...');
  execSync('npx sequelize-cli db:seed:all', { stdio: 'inherit' });

  console.log('[db:reset] OK — esquema reconstruido, migraciones y seeders aplicados.');
}

main().catch(err => {
  console.error('[db:reset] ERROR:', err.message);
  process.exit(1);
});
