// Codemod: convierte un módulo CommonJS .js a .ts manteniendo el contrato de exportación.
//   const X = require('m');              → import X = require('m');
//   const { a, b: c } = require('m');    → import mMod = require('m');\nconst { a, b: c } = mMod;
//   module.exports = new X(); module.exports.X = X;  → export = Object.assign(new X(), { X });
//   module.exports = …;                   → export = …;
// Los require() dentro de funciones (carga diferida) se dejan igual.
// Reporta lo que no sabe convertir (module.exports.foo = …, exports.foo, etc.) para revisión manual.
// Uso: node cjs-to-ts.js <archivo.js>...   (escribe <archivo>.ts y borra el .js con git mv)
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const camel = s =>
  s
    .replace(/^@[^/]+\//, '')
    .replace(/^node:/, '')
    .replace(/\.(js|ts|json)$/, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1)))
    .join('');

function convert(src, file) {
  const crlf = src.includes('\r\n');
  let s = src.replace(/\r\n/g, '\n');
  const notes = [];
  const used = new Set(s.match(/\b[A-Za-z_$][\w$]*\b/g));

  // 1) require con un solo identificador, a nivel superior
  s = s.replace(/^const ([A-Za-z_$][\w$]*) = require\((['"][^'"]+['"])\);?$/gm, 'import $1 = require($2);');

  // 2) require desestructurado (puede ser multilínea), a nivel superior
  s = s.replace(/^const (\{[^}]*\}) = require\((['"])([^'"]+)\2\)(\.\w+)?;?$/gm, (m, pattern, q, mod, member) => {
    let alias = camel(path.basename(mod)) + 'Module';
    while (used.has(alias)) alias += '_';
    used.add(alias);
    const source = member ? `${alias}${member}` : alias;
    return `import ${alias} = require(${q}${mod}${q});\nconst ${pattern} = ${source};`;
  });

  // 3) require con acceso a miembro: const X = require('m').Y;
  s = s.replace(/^const ([A-Za-z_$][\w$]*) = require\((['"])([^'"]+)\2\)\.([\w$]+);?$/gm, (m, name, q, mod, member) => {
    let alias = camel(path.basename(mod)) + 'Module';
    while (used.has(alias)) alias += '_';
    used.add(alias);
    return `import ${alias} = require(${q}${mod}${q});\nconst ${name} = ${alias}.${member};`;
  });

  // 4) instancia + clase
  s = s.replace(
    /^module\.exports = new ([A-Za-z_$][\w$]*)\(\);?\nmodule\.exports\.\1 = \1;?$/gm,
    'export = Object.assign(new $1(), { $1 });'
  );

  // 5) module.exports = …
  s = s.replace(/^module\.exports = /gm, 'export = ');

  const leftovers = s.match(/^(?:module\.)?exports\.[\w$]+\s*=.*$/gm) || [];
  if (leftovers.length) notes.push(`exports adicionales (revisar): ${leftovers.join(' | ')}`);
  if ((s.match(/^export = /gm) || []).length > 1) notes.push('más de un `export =`');
  const lazy = s.match(/^\s+.*require\(['"][^'"]+['"]\)/gm) || [];
  if (lazy.length) notes.push(`${lazy.length} require() diferidos (quedan como any)`);

  s = s.replace(/^\/\/ (.*)\.js$/m, (m, p) => (p.endsWith(path.basename(file, '.js')) ? `// ${p}.ts` : m));
  return { out: crlf ? s.replace(/\n/g, '\r\n') : s, notes };
}

for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  const { out, notes } = convert(src, file);
  const target = file.replace(/\.js$/, '.ts');
  execFileSync('git', ['mv', file, target]);
  fs.writeFileSync(target, out);
  console.log(`${target}${notes.length ? '\n   ⚠ ' + notes.join('\n   ⚠ ') : ''}`);
}
