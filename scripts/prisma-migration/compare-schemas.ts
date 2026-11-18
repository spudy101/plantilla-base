// scripts/prisma-migration/compare-schemas.ts
//
// Compara la estructura de dos esquemas de la misma base (DB_* de .env), objeto por objeto: columnas
// (tipo, NULL, default), constraints, índices, enums, funciones, triggers y comentarios. Sirvió para
// verificar que `prisma/migrations/0_init` deja la misma base que las migraciones de Sequelize, y sirve
// para revisar una base existente antes de marcarla como migrada (docs/prisma-migration.md, fase 6).
//
//   npx tsx scripts/prisma-migration/compare-schemas.ts <esquema_a> <esquema_b>
//
// Las tablas de tracking (SequelizeMeta, SequelizeData, _prisma_migrations) no se comparan. Sale con 1
// si hay diferencias. Solo lee.
import type { Client } from 'pg';
import { connectPg } from '../lib/pg-client';

const TRACKING = ['SequelizeMeta', 'SequelizeData', '_prisma_migrations'];

/** Índice heredado de Sequelize con el nombre del esquema adelante; el baseline lo renombra. */
const SCHEMA_PREFIXED_INDEX = /^(.+)_user_sessions_user_id_status$/;

async function describe(client: Client, schema: string): Promise<Set<string>> {
  const strip = (text: string) => text.split(`"${schema}".`).join('').split(`${schema}.`).join('');
  const out = new Set<string>();
  const q = async (sql: string) => (await client.query(sql, [schema, TRACKING])).rows;

  for (const r of await q(`
    SELECT c.table_name, c.column_name, c.data_type, c.udt_name, c.character_maximum_length,
           c.numeric_precision, c.numeric_scale, c.datetime_precision, c.is_nullable, c.column_default
      FROM information_schema.columns c
     WHERE c.table_schema = $1 AND c.table_name <> ALL($2)`)) {
    out.add(
      `column ${r.table_name}.${r.column_name} ${r.data_type}/${r.udt_name}(${r.character_maximum_length ?? ''},` +
        `${r.numeric_precision ?? ''},${r.numeric_scale ?? ''},${r.datetime_precision ?? ''}) ` +
        `null=${r.is_nullable} default=${strip(String(r.column_default)).replace(/^CURRENT_TIMESTAMP$/, 'now()')}`
    );
  }

  for (const r of await q(`
    SELECT t.relname AS table_name, con.conname, pg_get_constraintdef(con.oid) AS def
      FROM pg_constraint con
      JOIN pg_class t ON t.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = $1 AND t.relname <> ALL($2)`)) {
    out.add(`constraint ${r.table_name}.${r.conname} ${strip(r.def)}`);
  }

  for (const r of await q(`
    SELECT tablename, indexname, indexdef FROM pg_indexes
     WHERE schemaname = $1 AND tablename <> ALL($2)`)) {
    const name = SCHEMA_PREFIXED_INDEX.test(r.indexname) ? 'idx_user_sessions_user_id_status' : r.indexname;
    const def = strip(r.indexdef).replace(r.indexname, name);
    out.add(`index ${r.tablename}.${name} ${def}`);
  }

  for (const r of await q(`
    SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = $1 AND $2::text[] IS NOT NULL
     GROUP BY t.typname`)) {
    out.add(`enum ${r.typname} (${r.labels})`);
  }

  for (const r of await q(`
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = $1 AND $2::text[] IS NOT NULL`)) {
    // El cuerpo se compara sin espacios: la migración de Sequelize lo indentaba distinto
    out.add(`function ${r.proname} ${strip(r.def).replace(/\s+/g, ' ').trim()}`);
  }

  for (const r of await q(`
    SELECT c.relname AS table_name, tg.tgname, pg_get_triggerdef(tg.oid) AS def
      FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND NOT tg.tgisinternal AND $2::text[] IS NOT NULL`)) {
    out.add(`trigger ${r.table_name}.${r.tgname} ${strip(r.def)}`);
  }

  for (const r of await q(`
    SELECT c.relname, a.attname, d.description
      FROM pg_description d
      JOIN pg_class c ON c.oid = d.objoid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = d.objsubid AND d.objsubid > 0
     WHERE n.nspname = $1 AND c.relname <> ALL($2)`)) {
    out.add(`comment ${r.relname}${r.attname ? `.${r.attname}` : ''} ${r.description}`);
  }

  return out;
}

async function main(): Promise<void> {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) {
    console.error('Uso: npx tsx scripts/prisma-migration/compare-schemas.ts <esquema_a> <esquema_b>');
    process.exit(2);
  }
  const client = await connectPg();
  try {
    const [left, right] = [await describe(client, a), await describe(client, b)];
    const onlyLeft = [...left].filter(x => !right.has(x)).sort();
    const onlyRight = [...right].filter(x => !left.has(x)).sort();
    console.log(`[compare] ${a}: ${left.size} objetos · ${b}: ${right.size} objetos`);
    for (const x of onlyLeft) console.log(`  - solo en ${a}: ${x}`);
    for (const x of onlyRight) console.log(`  + solo en ${b}: ${x}`);
    if (onlyLeft.length + onlyRight.length > 0) {
      process.exitCode = 1;
      return;
    }
    console.log('[compare] sin diferencias');
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error('[compare] ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
