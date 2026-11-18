// scripts/prisma-migration/db-names.ts
//
// Fase 6c de docs/prisma-migration.md: nombres de índices y constraints según la convención del proyecto.
// Lee el catálogo de un esquema y escribe:
//   - el bloque de renombres de la migración (`ALTER TABLE … RENAME CONSTRAINT`, `ALTER INDEX … RENAME`);
//   - `prisma/schema.prisma` con el `map:` de cada `@id`, `@unique`, `@@unique`, `@@index` y `@relation`.
//
//   npx tsx scripts/prisma-migration/db-names.ts <esquema> <salida.sql> [--skip nombre,nombre…]
//
// `--skip`: objetos que la migración elimina o recrea antes de renombrar (no se renombran).
//
// Reglas:
//   PRIMARY KEY → pk_<tabla> · UNIQUE → uq_<tabla>_<columnas> · FOREIGN KEY → fk_<tabla>_<columnas>
//   CHECK → ck_<tabla>_<columnas> · índice → idx_<tabla>_<columnas> (único: uq_…)
//   Un nombre que ya empieza con `<prefijo>_<tabla>_` se respeta (p. ej. idx_audit_alerts_pending).
//   Si pasa de 63 caracteres (límite de Postgres) la tabla se abrevia según ABBREVIATIONS.
import fs from 'node:fs';
import type { Client } from 'pg';
import { connectPg } from '../lib/pg-client';

const ABBREVIATIONS: Record<string, string> = {
  user_notification_preferences: 'user_notif_prefs'
};
const MAX_IDENTIFIER = 63;
const PREFIX: Record<string, string> = { p: 'pk', u: 'uq', f: 'fk', c: 'ck' };

interface DbObject {
  kind: 'constraint' | 'index';
  table: string;
  name: string;
  target: string;
}

function targetName(prefix: string, table: string, cols: string[], current: string): string {
  if (current.startsWith(`${prefix}_${table}_`) || (prefix === 'pk' && current === `pk_${table}`)) {
    return current;
  }
  const build = (t: string) => (prefix === 'pk' ? `pk_${t}` : `${prefix}_${t}_${cols.join('_')}`);
  let name = build(table);
  if (name.length > MAX_IDENTIFIER) {
    const short = ABBREVIATIONS[table];
    if (!short) {
      throw new Error(`${name} pasa de ${MAX_IDENTIFIER} caracteres: agregar ${table} a ABBREVIATIONS`);
    }
    name = build(short);
  }
  return name;
}

async function readObjects(client: Client, schema: string, skip: Set<string>): Promise<DbObject[]> {
  const cols = `(SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(%KEY%) WITH ORDINALITY k(n, ord)
                 JOIN pg_attribute a ON a.attrelid = %REL% AND a.attnum = k.n)`;
  const constraints = await client.query<{ name: string; type: string; table: string; cols: string[] }>(
    `SELECT con.conname AS name, con.contype AS type, t.relname AS table,
            ${cols.replace('%KEY%', 'con.conkey').replace('%REL%', 'con.conrelid')} AS cols
       FROM pg_constraint con
       JOIN pg_class t ON t.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = con.connamespace
      WHERE n.nspname = $1 AND t.relname <> '_prisma_migrations' AND con.contype IN ('p', 'u', 'f', 'c')`,
    [schema]
  );
  const indexes = await client.query<{ name: string; table: string; unique: boolean; cols: string[] }>(
    `SELECT ic.relname AS name, t.relname AS table, ix.indisunique AS unique,
            ${cols.replace('%KEY%', 'ix.indkey').replace('%REL%', 'ix.indrelid')} AS cols
       FROM pg_index ix
       JOIN pg_class ic ON ic.oid = ix.indexrelid
       JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1 AND t.relname <> '_prisma_migrations'
        AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = ix.indexrelid AND con.contype IN ('p', 'u'))`,
    [schema]
  );
  const objects: DbObject[] = [];
  for (const c of constraints.rows.filter(r => !skip.has(r.name))) {
    const prefix = PREFIX[c.type]!;
    objects.push({ kind: 'constraint', table: c.table, name: c.name, target: targetName(prefix, c.table, c.cols ?? [], c.name) });
  }
  for (const i of indexes.rows.filter(r => !skip.has(r.name))) {
    objects.push({
      kind: 'index',
      table: i.table,
      name: i.name,
      target: targetName(i.unique ? 'uq' : 'idx', i.table, i.cols, i.name)
    });
  }
  const seen = new Map<string, string>();
  for (const o of objects) {
    if (seen.has(o.target)) {
      throw new Error(`Colisión: ${o.name} y ${seen.get(o.target)} → ${o.target}`);
    }
    seen.set(o.target, o.name);
  }
  return objects;
}

function renameSql(objects: DbObject[]): string {
  const lines = objects
    .filter(o => o.name !== o.target)
    .sort((a, b) => a.table.localeCompare(b.table) || a.name.localeCompare(b.name))
    .map(o =>
      o.kind === 'constraint'
        ? `ALTER TABLE "${o.table}" RENAME CONSTRAINT "${o.name}" TO "${o.target}";`
        : `ALTER INDEX "${o.name}" RENAME TO "${o.target}";`
    );
  return lines.join('\n') + '\n';
}

// ── schema.prisma ────────────────────────────────────────────────────────────────────────────────────

interface ModelInfo {
  table: string;
  columns: Map<string, string>;
}

/** Nombre que Prisma supone si el atributo no tiene `map:` (coincide con el default de Postgres). */
function defaultName(kind: 'pk' | 'uq' | 'idx' | 'fk', table: string, cols: string[]): string {
  if (kind === 'pk') return `${table}_pkey`;
  const suffix = { uq: 'key', idx: 'idx', fk: 'fkey' }[kind];
  return `${table}_${cols.join('_')}_${suffix}`;
}

function withMap(attr: string, name: string): string {
  // attr: `@id`, `@unique`, `@id(...)`, `@@index([...], ...)`, `@relation(...)`
  if (/map:\s*"[^"]*"/.test(attr)) {
    return attr.replace(/map:\s*"[^"]*"/, `map: "${name}"`);
  }
  if (attr.endsWith(')')) {
    return attr.replace(/\)$/, `, map: "${name}")`).replace('(, ', '(');
  }
  return `${attr}(map: "${name}")`;
}

function patchSchema(file: string, renames: Map<string, string>): number {
  const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const blocks = src.split(/(?=^model \w+ \{)/m);
  let changed = 0;
  const out = blocks.map(block => {
    const header = /^model (\w+) \{/.exec(block);
    if (!header) return block;
    const body = block.slice(0, block.indexOf('\n}') + 2);
    const rest = block.slice(body.length);
    const info: ModelInfo = { table: /@@map\("([^"]+)"\)/.exec(body)?.[1] ?? header[1]!, columns: new Map() };
    for (const line of body.split('\n')) {
      const field = /^\s+(\w+)\s+\S+/.exec(line);
      if (field && !line.trim().startsWith('@@') && !line.trim().startsWith('//')) {
        info.columns.set(field[1]!, /@map\("([^"]+)"\)/.exec(line)?.[1] ?? field[1]!);
      }
    }
    const col = (f: string) =>
      info.columns.get(
        f
          .trim()
          .replace(/\(.*\)$/, '')
          .trim()
      ) ?? f.trim();
    const listCols = (list: string) => list.split(',').map(s => col(s));
    const resolve = (kind: 'pk' | 'uq' | 'idx' | 'fk', cols: string[], attr: string) => {
      const current = /map:\s*"([^"]*)"/.exec(attr)?.[1] ?? defaultName(kind, info.table, cols);
      const target = renames.get(`${info.table}|${current}`) ?? current;
      if (/map:\s*"/.test(attr) && target === current) return attr;
      changed++;
      return withMap(attr, target);
    };
    const lines = body.split('\n').map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('@@id(')) {
        return line.replace(/@@id\(\[([^\]]*)\][^)]*\)/, a => resolve('pk', listCols(/\[([^\]]*)\]/.exec(a)![1]!), a));
      }
      if (trimmed.startsWith('@@unique(')) {
        return line.replace(/@@unique\(\[([^\]]*)\].*\)$/, a => resolve('uq', listCols(/\[([^\]]*)\]/.exec(a)![1]!), a));
      }
      if (trimmed.startsWith('@@index(')) {
        return line.replace(/@@index\(\[([^\]]*)\].*\)$/, a => resolve('idx', listCols(/\[([^\]]*)\]/.exec(a)![1]!), a));
      }
      const field = /^\s+(\w+)\s+\S+/.exec(line);
      if (!field || trimmed.startsWith('//')) return line;
      let next = line;
      next = next.replace(/@id(\([^)]*\))?(?=\s|$)/, a => resolve('pk', [col(field[1]!)], a));
      next = next.replace(/@unique(\([^)]*\))?(?=\s|$)/, a => resolve('uq', [col(field[1]!)], a));
      next = next.replace(/@relation\(([^)]*fields:\s*\[([^\]]*)\][^)]*)\)/, a =>
        resolve('fk', listCols(/fields:\s*\[([^\]]*)\]/.exec(a)![1]!), a)
      );
      return next;
    });
    return lines.join('\n') + rest;
  });
  fs.writeFileSync(file, out.join(''));
  return changed;
}

async function main(): Promise<void> {
  const [schema, output] = process.argv.slice(2);
  const skipArg = process.argv.indexOf('--skip');
  const skip = new Set(skipArg > 0 ? (process.argv[skipArg + 1] ?? '').split(',').filter(Boolean) : []);
  if (!schema || !output) {
    console.error('Uso: npx tsx scripts/prisma-migration/db-names.ts <esquema> <salida.sql> [--skip a,b]');
    process.exit(2);
  }
  const client = await connectPg();
  try {
    const objects = await readObjects(client, schema, skip);
    fs.writeFileSync(output, renameSql(objects));
    const renames = new Map(objects.map(o => [`${o.table}|${o.name}`, o.target]));
    const changed = patchSchema('prisma/schema.prisma', renames);
    const renamed = objects.filter(o => o.name !== o.target).length;
    console.log(
      `[db-names] ${objects.length} objetos, ${renamed} renombres → ${output}; schema.prisma: ${changed} atributos con map`
    );
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error('[db-names] ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
