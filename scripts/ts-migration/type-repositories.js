// scripts/ts-migration/type-repositories.js
//
// Después de cjs-to-ts: a cada repositorio `class XRepository extends BaseRepository { constructor() {
// super(Model, …) } }` le agrega el genérico del modelo (`BaseRepository<defineModel.Instance>`) y el
// `import type defineModel = require(…)`, tomando la ruta del modelo de shared/models/registry.ts.
// Con eso this.model, findById, create… quedan tipados con las columnas reales.
//
// Uso: node scripts/ts-migration/type-repositories.js <archivos.repository.ts…>
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const registry = fs.readFileSync(path.join(ROOT, 'shared/models/registry.ts'), 'utf8');
const modelFile = new Map(
  [...registry.matchAll(/^import type define(\w+) = require\('([^']+)'\);$/gm)].map(m => [
    m[1],
    path.resolve(ROOT, 'shared/models', m[2])
  ])
);

const rel = (from, to) => {
  const r = path.relative(path.dirname(from), to).split(path.sep).join('/');
  return r.startsWith('.') ? r : `./${r}`;
};

for (const arg of process.argv.slice(2)) {
  const file = path.resolve(arg);
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');
  const added = new Set();
  // class X extends Base { … constructor(…) { super(Model, …
  s = s.replace(
    /(class \w+ extends (?:BaseRepository|AppendOnlyRepository|ReadRepository))(\s*\{[\s\S]*?super\(\s*(\w+)\b)/g,
    (m, head, body, model) => {
      if (!modelFile.has(model)) {
        console.warn(`  ⚠ ${arg}: super(${model}) no es un modelo del registro`);
        return m;
      }
      added.add(model);
      return `${head}<define${model}.Instance>${body}`;
    }
  );
  if (!added.size) {
    console.log(`${arg}: sin cambios`);
    continue;
  }
  const imports = [...added]
    .sort()
    .map(n => `import type define${n} = require('${rel(file, modelFile.get(n))}');`)
    .join('\n');
  const last = [...s.matchAll(/^(?:import .*;|const .* = [\w$]+Module(?:\.[\w$]+)?;)$/gm)].pop();
  const pos = last ? last.index + last[0].length : 0;
  s = s.slice(0, pos) + '\n' + imports + s.slice(pos);
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
  console.log(`${arg}: ${[...added].join(', ')}`);
}
