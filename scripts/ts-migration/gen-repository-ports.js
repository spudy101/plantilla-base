// scripts/ts-migration/gen-repository-ports.js
//
// Genera modules/schemas/repository-ports.ts: un tipo `XRepositoryPort` por repositorio, igual al
// contrato público de su instancia (typeof). Es la fuente de la que cada service deriva SU puerto
// con solo los métodos que usa (SOLID: I + D), sin importar el repositorio en runtime:
//
//   import type { UserRepositoryPort } from '../../../schemas/repository-ports';
//   type UserReader = Pick<UserRepositoryPort, 'findByUserId' | 'findAllPaginated'>;
//   namespace MiService { export interface Deps { userRepository?: UserReader } }
//
// Uso (desde la raíz; regenerar al agregar o renombrar un repositorio):
//   node scripts/ts-migration/gen-repository-ports.js
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'modules/schemas/repository-ports.ts');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : e.name.endsWith('.repository.ts') ? [full] : [];
  });
}

const camel = s => s.replace(/-(\w)/g, (_, c) => c.toUpperCase());
const pascal = s => camel(s).replace(/^\w/, c => c.toUpperCase());

const entries = [];
for (const file of walk(path.join(ROOT, 'modules')).sort()) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = `./${path.relative(path.dirname(OUT), file).split(path.sep).join('/').replace(/\.ts$/, '')}`;
  const base = path.basename(file, '.repository.ts');
  const alias = `${camel(base)}RepositoryModule`;
  const single = src.match(/^export default new (\w+)\(\);/m);
  if (single) {
    // El nombre del puerto sale de la clase (TrustedDeviceRepository → TrustedDeviceRepositoryPort)
    entries.push({ alias, rel, ports: [[`${single[1]}Port`, `typeof ${alias}`]] });
    continue;
  }
  const multi = src.match(/^export default \{([\s\S]*?)\};/m);
  if (multi) {
    const keys = [...multi[1].matchAll(/^\s*(\w+):/gm)].map(m => m[1]);
    entries.push({ alias, rel, ports: keys.map(k => [`${pascal(k)}Port`, `(typeof ${alias})['${k}']`]) });
    continue;
  }
  throw new Error(`${file}: export no reconocido (se espera "export default new X();" o "export default { … };")`);
}

const out = `// modules/schemas/repository-ports.ts
//
// Contratos públicos de los repositorios (generado con scripts/ts-migration/gen-repository-ports.js;
// no editar a mano). Solo tipos: no carga ningún repositorio.
//
// Cada service declara su dependencia con los métodos que usa (Interface Segregation) y la recibe
// por constructor (Dependency Inversion); el repositorio real o un doble de test encajan igual:
//
//   type UserReader = Pick<UserRepositoryPort, 'findByUserId'>;
//   constructor(deps: { userRepository?: UserReader } = {})
${entries.map(e => `import type ${e.alias} from '${e.rel}';`).join('\n')}

${entries
  .flatMap(e => e.ports)
  .map(([name, type]) => `export type ${name} = ${type};`)
  .join('\n')}
`;
fs.writeFileSync(OUT, out);
console.log(`${path.relative(ROOT, OUT)}: ${entries.flatMap(e => e.ports).length} puertos`);
