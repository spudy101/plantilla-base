// Codemod para tests .ts: los módulos reemplazados con jest.mock() se leen a través de `mocked()`
// (tests/helpers/mock.ts) para poder llamar .mockReturnValue & cía. sobre sus funciones.
//   import X = require('m');                 → import XModule = require('m');\nconst X = mocked(XModule);
//   import mModule = require('m');\nconst { a } = mModule;  → const { a } = mocked(mModule);
// Solo toca los `m` que el mismo archivo pasa a jest.mock()/jest.doMock(). Idempotente.
// Uso: node scripts/ts-migration/test-mocks.js <tests.ts…>
const fs = require('node:fs');

const esc = s => s.replace(/\$/g, '\\$');

for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  const crlf = src.includes('\r\n');
  let s = src.replace(/\r\n/g, '\n');
  const mockedSpecs = new Set([...s.matchAll(/jest\.(?:mock|doMock)\(\s*(['"])([^'"]+)\1/g)].map(m => m[2]));
  if (!mockedSpecs.size) continue;
  const used = new Set(s.match(/\b[A-Za-z_$][\w$]*\b/g));

  // 1) alias generado por cjs-to-ts (`import mModule = require('m');\nconst {…} = mModule;`)
  s = s.replace(
    /^import ([A-Za-z_$][\w$]*) = require\((['"])([^'"]+)\2\);\n(const \{[^}]*\} = )\1((?:\.[\w$]+)?;)$/gm,
    (m, name, q, spec, head, tail) =>
      mockedSpecs.has(spec) ? `import ${name} = require(${q}${spec}${q});\n${head}mocked(${name})${tail}` : m
  );

  // 2) import directo: se renombra el import y el nombre original pasa a ser la vista mockeada
  s = s.replace(/^import ([A-Za-z_$][\w$]*) = require\((['"])([^'"]+)\2\);$/gm, (m, name, q, spec, offset) => {
    if (!mockedSpecs.has(spec)) return m;
    const next = s.slice(offset + m.length + 1).split('\n')[0];
    if (new RegExp(`mocked\\(${esc(name)}\\)`).test(next)) return m; // ya convertido / alias del paso 1
    let alias = `${name}Module`;
    while (used.has(alias)) alias += '_';
    used.add(alias);
    return `import ${alias} = require(${q}${spec}${q});\nconst ${name} = mocked(${alias});`;
  });

  if (!/\bmocked\(/.test(s)) continue;
  // import del helper ANTES del primer import: en la salida CommonJS los imports quedan en orden y
  // `const X = mocked(…)` no puede correr antes de cargar el helper
  const helper = s.match(/^import \{([^}]*)\} from 'tests\/helpers\/mock';$/m);
  if (!helper) {
    const i = s.search(/^import .* = require\(/m);
    s = `${s.slice(0, i)}import { mocked } from 'tests/helpers/mock';\n${s.slice(i)}`;
  } else if (!/\bmocked\b/.test(helper[1])) {
    s = s.replace(helper[0], `import { mocked, ${helper[1].trim()} } from 'tests/helpers/mock';`);
  }
  const out = crlf ? s.replace(/\n/g, '\r\n') : s;
  if (out !== src) {
    fs.writeFileSync(file, out);
    console.log(file);
  }
}
