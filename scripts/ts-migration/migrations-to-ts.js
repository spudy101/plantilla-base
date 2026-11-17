// Codemod: migraciones y seeders (.js con `module.exports = { up, down }`) → .ts.
//   - imports como cjs-to-ts (`import x = require()`)
//   - `module.exports = {` … `};`  →  `export default {` … `} satisfies Migration;`
//     (+ `import type { Migration } from '../shared/types/migration';`), lo que tipa
//     `queryInterface` y `Sequelize` por contexto sin anotar cada método.
// Uso: node scripts/ts-migration/migrations-to-ts.js <archivos.js…>   (git mv x.js x.ts)
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

for (const file of process.argv.slice(2)) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');

  s = s.replace(/^const ([A-Za-z_$][\w$]*) = require\((['"][^'"]+['"])\);?$/gm, 'import $1 = require($2);');
  s = s.replace(/^const (\{[^}]*\}) = require\((['"])([^'"]+)\2\);?$/gm, (m, pattern, q, mod) => {
    const alias = mod.split('/').pop().replace(/\.(js|ts)$/, '').replace(/[^A-Za-z0-9]+(.)/g, (x, c) => c.toUpperCase()) + 'Module';
    return `import ${alias} = require(${q}${mod}${q});\nconst ${pattern} = ${alias};`;
  });

  if (!/^module\.exports = \{$/m.test(s)) {
    console.error(`⚠ ${file}: no tiene \`module.exports = {\` (se deja sin convertir)`);
    continue;
  }
  s = s.replace(/^module\.exports = \{$/m, 'export default {');
  const end = s.lastIndexOf('\n};');
  s = `${s.slice(0, end)}\n} satisfies Migration;${s.slice(end + 3)}`;
  s = s.replace(/^\/\*\* @type \{import\('sequelize-cli'\)\.Migration\} \*\/\n/m, '');

  // import del tipo antes del primer import (o al principio, después de los comentarios de cabecera)
  const typeImport = "import type { Migration } from '../shared/types/migration';\n";
  const firstImport = s.search(/^import /m);
  if (firstImport >= 0) s = s.slice(0, firstImport) + typeImport + s.slice(firstImport);
  else {
    const body = s.search(/^(?!\/\/)(?!\s*$)/m);
    s = s.slice(0, body) + typeImport + '\n' + s.slice(body);
  }
  s = s.replace(/^\/\/ ((?:migrations|seeders)\/.*)\.js$/m, '// $1.ts');

  const target = file.replace(/\.js$/, '.ts');
  execFileSync('git', ['mv', file, target]);
  fs.writeFileSync(target, crlf ? s.replace(/\n/g, '\r\n') : s);
}
