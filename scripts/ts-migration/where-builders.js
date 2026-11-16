// scripts/ts-migration/where-builders.js
//
// Repositorios que arman el where por partes:
//   const where = {};                          → const where: WhereClause = {};
//   if (from || to) {                          → const createdAtRange = dateRange(from, to);
//     where.created_at = {};                     if (createdAtRange) {
//     if (from) where.created_at[Op.gte] = …       where.created_at = createdAtRange;
//     if (to)   where.created_at[Op.lte] = …     }
//   }
// (range() si el original no convertía con new Date(); dateRange() si sí). Agrega el import de
// shared/repositories/query. El paso del where al modelo (toWhere(where)) lo marca tsc y se hace a mano.
//
// Uso: node scripts/ts-migration/where-builders.js <archivos.ts…>
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const camel = s => s.replace(/_(\w)/g, (_, c) => c.toUpperCase());

const RANGE_RE =
  /^([ \t]+)if \([^)\n]+\) \{\n[ \t]+((?:where|criteria)(?:\.\w+)?)\.(\w+) = \{\};\n[ \t]+if \(([^)\n]+)\) \{\n[ \t]+\2\.\3\[Op\.gte\] = (new Date\()?\4\)?;\n[ \t]+\}\n[ \t]+if \(([^)\n]+)\) \{\n[ \t]+\2\.\3\[Op\.lte\] = (?:new Date\()?\6\)?;\n[ \t]+\}\n[ \t]+\}$/gm;

for (const arg of process.argv.slice(2)) {
  const file = path.resolve(arg);
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');
  const used = new Set();
  let ranges = 0;

  s = s.replace(RANGE_RE, (m, ind, target, column, from, asDate, to) => {
    const fn = asDate ? 'dateRange' : 'range';
    used.add(fn);
    ranges++;
    const v = `${camel(column)}Range`;
    return `${ind}const ${v} = ${fn}(${from}, ${to});\n${ind}if (${v}) {\n${ind}  ${target}.${column} = ${v};\n${ind}}`;
  });

  let builders = 0;
  s = s.replace(/^([ \t]+)(const|let) (where|criteria|whereClause) = \{\};$/gm, (m, ind, kw, name) => {
    builders++;
    return `${ind}${kw} ${name}: WhereClause = {};`;
  });

  if (!ranges && !builders) {
    continue;
  }
  const rel = path.relative(path.dirname(file), path.join(ROOT, 'shared/repositories/query')).split(path.sep).join('/');
  const values = [...used, 'toWhere'].sort();
  const imports = [`import queryModule = require('${rel}');`, `const { ${values.join(', ')} } = queryModule;`];
  if (builders) {
    imports.push(`import type { WhereClause } from '${rel}';`);
  }
  if (!s.includes(`require('${rel}')`)) {
    const last = [...s.matchAll(/^(?:import .*;|const .* = [\w$]+Module(?:\.[\w$]+)?;)$/gm)].pop();
    const pos = last ? last.index + last[0].length : 0;
    s = s.slice(0, pos) + '\n' + imports.join('\n') + s.slice(pos);
  }
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
  console.log(`${arg}: ${builders} builders, ${ranges} rangos`);
}
