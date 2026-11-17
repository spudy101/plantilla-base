// scripts/prisma-migration/prisma-names.ts
//
// Fase 0 de docs/prisma-migration.md. Toma el schema que deja `prisma db pull` (nombres de la base:
// tablas y columnas snake_case, relaciones con nombres generados) y lo pasa a las convenciones de la
// plantilla SIN cambiar la base: cada nombre de Postgres queda explícito con @@map / @map / map:.
//
//   tabla `user_sessions`            → model UserSession      @@map("user_sessions")
//   columna `user_id`                → userId                 @map("user_id")
//   enum `enum_approval_requests_status` → enum ApprovalRequestStatus  @@map(…)
//   relación `users_approval_requests_requested_byTousers` → el alias `as` de la asociación de
//     Sequelize (`requester`), así los `include` conservan su nombre; si no hay asociación, uno derivado
//     de la foreign key (`requested_by` → `requestedByUser`).
//   PK uuid sin default en la base   → @default(uuid())  (Sequelize lo generaba en la app: UUIDV4)
//   updated_at                       → @updatedAt        (Sequelize lo asignaba en la app)
//   created_at sin DEFAULT           → @default(now())   (ídem; la fase 6c lo lleva a la base)
//
// Los nombres de los modelos salen de los modelos de Sequelize (shared/models), que ya son PascalCase.
// Uso: npx tsx scripts/prisma-migration/prisma-names.ts   (lee y reescribe prisma/schema.prisma)
import fs from 'node:fs';
import path from 'node:path';
import db from '../../shared/models';

const SCHEMA = path.resolve('prisma/schema.prisma');
// Tablas de tracking de sequelize-cli: se ignoran en el cliente hasta quitar Sequelize (fase 6)
const IGNORED = new Set(['SequelizeMeta', 'SequelizeData']);

const camel = (s: string): string => s.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
const pascal = (s: string): string => camel(s).replace(/^[a-z]/, c => c.toUpperCase());
// Plural en inglés para los nombres de lista (city → cities, resetCredentials → resetCredentials)
const plural = (s: string): string =>
  /s$/.test(s) ? s : /(x|z|ch|sh)$/.test(s) ? `${s}es` : /[^aeiou]y$/.test(s) ? `${s.slice(0, -1)}ies` : `${s}s`;

// ── Metadatos de Sequelize: tabla → modelo y asociaciones ──
interface Assoc { as: string; type: string; targetTable: string; foreignKey: string }
const tableOf = (m: { getTableName(): unknown }): string => {
  const t = m.getTableName() as string | { tableName: string };
  return typeof t === 'string' ? t : t.tableName;
};
const modelByTable = new Map<string, string>();
const assocsByTable = new Map<string, Assoc[]>();
for (const [name, model] of Object.entries(db as unknown as Record<string, unknown>)) {
  const m = model as { getTableName?: () => unknown; associations?: Record<string, { associationType: string; target: { getTableName(): unknown }; foreignKey: string }> };
  if (typeof m?.getTableName !== 'function' || !m.associations) continue;
  const table = tableOf(m as { getTableName(): unknown });
  modelByTable.set(table, name);
  assocsByTable.set(table, Object.entries(m.associations).map(([as, a]) => ({ as, type: a.associationType, targetTable: tableOf(a.target), foreignKey: a.foreignKey })));
}

// ── Parseo del schema (bloques model/enum) ──
const src = fs.readFileSync(SCHEMA, 'utf8').replace(/\r\n/g, '\n');
interface Field { name: string; type: string; base: string; attrs: string; raw: string }
interface Block { kind: 'model' | 'enum'; name: string; lines: string[]; fields: Field[] }
const blocks: Block[] = [];
const header: string[] = [];
{
  let cur: Block | null = null;
  for (const line of src.split('\n')) {
    const open = line.match(/^(model|enum) (\w+) \{$/);
    if (open) { cur = { kind: open[1] as Block['kind'], name: open[2]!, lines: [], fields: [] }; continue; }
    if (cur && line === '}') { blocks.push(cur); cur = null; continue; }
    if (!cur) { if (!/^\/\/\/ This model/.test(line)) header.push(line); continue; }
    cur.lines.push(line);
    const f = line.match(/^\s+(\w+)\s+(\S+)(.*)$/);
    if (cur.kind === 'model' && f && !line.trim().startsWith('@@') && !line.trim().startsWith('//')) {
      cur.fields.push({ name: f[1]!, type: f[2]!, base: f[2]!.replace(/[?[\]]/g, ''), attrs: f[3] ?? '', raw: line });
    }
  }
}
const models = new Map(blocks.filter(b => b.kind === 'model').map(b => [b.name, b]));
const enums = new Map(blocks.filter(b => b.kind === 'enum').map(b => [b.name, b]));

// ── Nombres nuevos ──
const modelName = new Map<string, string>();
for (const table of models.keys()) {
  modelName.set(table, IGNORED.has(table) ? table : modelByTable.get(table) ?? pascal(table));
}
const enumName = new Map<string, string>();
for (const e of enums.keys()) {
  // enum_<tabla>_<columna>: el modelo dueño + la columna (enum_approval_requests_status → ApprovalRequestStatus)
  const rest = e.replace(/^enum_/, '');
  const table = [...models.keys()].filter(t => rest.startsWith(`${t}_`)).sort((a, b) => b.length - a.length)[0];
  enumName.set(e, table ? `${modelName.get(table)}${pascal(rest.slice(table.length + 1))}` : pascal(rest));
}
const newType = (t: string): string => {
  const base = t.replace(/[?[\]]/g, '');
  const suffix = t.slice(base.length);
  return (modelName.get(base) ?? enumName.get(base) ?? base) + suffix;
};

const relationArgs = (attrs: string): { name?: string; fields?: string[] } => {
  const m = attrs.match(/@relation\(([^)]*)\)/);
  if (!m) return {};
  const name = m[1]!.match(/^"([^"]+)"/)?.[1];
  const fields = m[1]!.match(/fields: \[([^\]]+)\]/)?.[1]?.split(',').map(s => s.trim());
  return { name, fields };
};

// Nombre de cada campo de relación: primero el lado con la FK, después el inverso
const relName = new Map<string, string>(); // `${table}.${field}` → nombre nuevo
const relString = new Map<string, string>(); // nombre de @relation viejo → nuevo
const notes: string[] = [];
for (const [table, block] of models) {
  for (const f of block.fields) {
    if (!models.has(f.base)) continue;
    const { name, fields } = relationArgs(f.attrs);
    if (!fields) continue; // lado inverso: más abajo
    const fk = fields[0]!;
    const assoc = (assocsByTable.get(table) ?? []).find(a => a.type === 'BelongsTo' && a.targetTable === f.base && a.foreignKey === fk);
    // alias de la asociación en camelCase (los de Sequelize a veces son snake_case: document_type)
    let n = assoc ? camel(assoc.as) : camel(fk.replace(/_id$/, ''));
    if (!assoc) {
      if (block.fields.some(x => camel(x.name) === n)) n = `${n}${modelName.get(f.base)}`; // requested_by → requestedByUser
      notes.push(`${modelName.get(table)}.${n} (sin asociación en Sequelize: nombre derivado de ${fk})`);
    }
    relName.set(`${table}.${f.name}`, n);
    if (name) relString.set(name, `${modelName.get(table)}_${n}`);
  }
}
for (const [table, block] of models) {
  for (const f of block.fields) {
    if (!models.has(f.base) || relationArgs(f.attrs).fields) continue;
    // pareja: el campo del otro modelo que apunta acá con el mismo nombre de relación (o sin nombre)
    const name = relationArgs(f.attrs).name;
    const other = models.get(f.base)!.fields.find(x => x.base === table && relationArgs(x.attrs).fields && relationArgs(x.attrs).name === name);
    const fk = other ? relationArgs(other.attrs).fields![0]! : '';
    const assoc = (assocsByTable.get(table) ?? []).find(a => (a.type === 'HasMany' || a.type === 'HasOne') && a.targetTable === f.base && a.foreignKey === fk);
    let n = assoc ? camel(assoc.as) : undefined;
    if (!n) {
      const target = modelName.get(f.base)!;
      const single = target.replace(/^[A-Z]/, c => c.toLowerCase());
      n = f.type.endsWith('[]') ? plural(single) : single;
      const siblings = block.fields.filter(x => x.base === f.base && !relationArgs(x.attrs).fields).length;
      if (siblings > 1) n += `By${pascal(fk.replace(/_id$/, ''))}`;
      notes.push(`${modelName.get(table)}.${n} (inversa sin asociación en Sequelize)`);
    }
    relName.set(`${table}.${f.name}`, n);
  }
}

// ── Reescritura ──
const out: string[] = [...header.join('\n').trimEnd().split('\n'), ''];
for (const b of blocks) {
  if (b.kind === 'enum') {
    out.push(`enum ${enumName.get(b.name)} {`, ...b.lines.filter(l => l.trim()), `  @@map("${b.name}")`, '}', '');
    continue;
  }
  const table = b.name;
  const fieldMap = new Map(b.fields.map(f => [f.name, relName.get(`${table}.${f.name}`) ?? camel(f.name)]));
  // Dos columnas que dan el mismo campo (`deletedAt` residual de una migración + `deleted_at`, la que
  // usa la app): la que no está en snake_case queda fuera del schema (Prisma no deja mapear a un nombre
  // que ya usa otro campo) y la elimina la fase 6c.
  const skipped = new Set<string>();
  for (const f of b.fields) {
    const n = fieldMap.get(f.name)!;
    if (f.name === n && b.fields.some(x => x !== f && fieldMap.get(x.name) === n)) {
      skipped.add(f.name);
      notes.push(`${modelName.get(table)}: columna "${f.name}" fuera del schema (duplica a otra; sin uso en la app)`);
    }
  }
  const mapCols = (list: string): string => list.split(',').map(s => {
    const t = s.trim();
    const col = t.match(/^(\w+)(.*)$/);
    return col ? `${fieldMap.get(col[1]!) ?? col[1]}${col[2]}` : t;
  }).join(', ');
  const body: string[] = [];
  for (const line of b.lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('///') || t.startsWith('//')) { body.push(line); continue; }
    if (t.startsWith('@@')) {
      const cols = t.match(/\[([^\]]+)\]/)?.[1]?.split(',').map(s => s.trim().replace(/\(.*$/, '')) ?? [];
      if (cols.some(c => skipped.has(c))) continue; // índice sobre una columna que quedó fuera
      // @@index([a, b], map: …) / @@unique / @@id: columnas → campos
      body.push('  ' + t.replace(/\[([^\]]+)\]/, (_m, l: string) => `[${mapCols(l)}]`));
      continue;
    }
    const f = b.fields.find(x => x.raw === line)!;
    if (skipped.has(f.name)) {
      body.push(`  // columna "${f.name}" fuera del schema: residuo sin uso (la real es deleted_at); fase 6c la elimina`);
      continue;
    }
    let attrs = f.attrs.trim();
    const isRelation = models.has(f.base);
    if (isRelation) {
      attrs = attrs
        .replace(/@relation\("([^"]+)"/, (_m, n: string) => `@relation("${relString.get(n) ?? n}"`)
        .replace(/fields: \[([^\]]+)\]/, (_m, l: string) => `fields: [${mapCols(l)}]`)
        // references apunta a columnas escalares del modelo destino: mismo camelCase
        .replace(/references: \[([^\]]+)\]/, (_m, l: string) => `references: [${l.split(',').map(c => camel(c.trim())).join(', ')}]`);
    } else {
      if (/@id\b/.test(attrs) && /@db\.Uuid/.test(attrs) && !/@default/.test(attrs)) attrs = attrs.replace(/@id\b/, '@id @default(uuid())');
      if (f.name === 'updated_at' && !/@updatedAt/.test(attrs)) attrs = `${attrs} @updatedAt`;
      // created_at sin DEFAULT en la base (lo ponía Sequelize): la fase 6c agrega el DEFAULT now()
      if (f.name === 'created_at' && !/@default/.test(attrs)) attrs = `${attrs} @default(now())`;
    }
    const name = fieldMap.get(f.name)!;
    if (!isRelation && name !== f.name) attrs = `${attrs} @map("${f.name}")`;
    body.push(`  ${name} ${newType(f.type)} ${attrs}`.trimEnd());
  }
  const mn = modelName.get(table)!;
  if (mn !== table) body.push(`  @@map("${table}")`);
  if (IGNORED.has(table)) body.push('  @@ignore');
  out.push(`model ${mn} {`, ...body, '}', '');
}
fs.writeFileSync(SCHEMA, out.join('\n').replace(/\n{3,}/g, '\n\n'));
console.log(`${models.size} modelos, ${enums.size} enums → ${path.relative(process.cwd(), SCHEMA)}`);
if (notes.length) console.log(`\nRelaciones sin asociación en Sequelize (revisar el nombre):\n  - ${notes.join('\n  - ')}`);
process.exit(0);
