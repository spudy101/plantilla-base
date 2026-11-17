// tests/unit/guards/solid-architecture.test.ts
//
// Guardas de arquitectura (análisis estático, sin cargar módulos). Hacen cumplir las reglas de
// docs/solid.md para que no se pierdan con el tiempo. Si una falla, la corrección casi siempre es
// mover la consulta/enum/include al repositorio o a shared/constants — no ampliar el allowlist.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : walk(full);
    }
    // los .d.ts solo declaran tipos
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [full] : [];
  });
}

const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join('/');
const read = (file: string) => fs.readFileSync(file, 'utf8');
const sourceFiles = [...walk(path.join(ROOT, 'modules')), ...walk(path.join(ROOT, 'shared'))];
const isService = (f: string) => f.endsWith('.service.ts');
const isRepository = (f: string) => f.endsWith('.repository.ts');

// Capa de aplicación: lo que NO debe conocer el ORM.
const APPLICATION_LAYER = /\.(service|helper|validator|controller|middleware|util)\.(js|ts)$/;

// Adaptadores de infraestructura que escriben/arrancan con Sequelize a propósito (ver docs/solid.md § D).
const ORM_ALLOWLIST = new Set([
  'shared/utils/logger.util.ts', // escribe audit_logs (require diferido: el resto del sistema depende del logger)
  'shared/utils/integration-api-logger.util.ts' // escribe integration_api_logs (mismo motivo)
]);

// `import … from '…'` y los require('…') diferidos (cortan ciclos de carga).
// `import type` se excluye: solo trae tipos, no acopla en runtime.
const MODELS_REQUIRE = /(?:require\(\s*|(?<!import type [^\n]*)from\s+)['"][^'"]*(?:shared\/models|\.\.\/models)['"]/;
const SEQUELIZE_REQUIRE = /(?:require\(\s*|^import (?!type)[^\n]*from\s+)['"]sequelize['"]/m;
const REPOSITORY_REQUIRE = /(?:require\(|from\s+)\s*['"][^'"]*\.repository['"]/;
const CONSTRUCTOR_DEPS = /constructor\(deps(?::\s*[^=)]+)?\s*=\s*\{\}\)/;

describe('SOLID — guardas de arquitectura', () => {
  const applicationFiles = sourceFiles.filter(f => APPLICATION_LAYER.test(f) && !ORM_ALLOWLIST.has(rel(f)));

  it('la capa de aplicación no importa modelos Sequelize (D: usar repositorios y shared/constants/domain-enums)', () => {
    const offenders = applicationFiles.filter(f => MODELS_REQUIRE.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('la capa de aplicación no importa sequelize ni usa operadores Op (I/D: consultas con nombre de negocio)', () => {
    const offenders = applicationFiles.filter(f => SEQUELIZE_REQUIRE.test(read(f)) || /\bOp\.\w+/.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('los services no arman include con modelos (`model: X`) — los include viven en el repositorio', () => {
    const offenders = sourceFiles
      .filter(isService)
      .filter(f => /\bmodel:\s*[A-Z]\w*/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('todo repositorio pertenece a la jerarquía Read/Base/AppendOnly (L)', () => {
    const offenders = sourceFiles
      .filter(f => isRepository(f) && !rel(f).startsWith('shared/repositories/'))
      .filter(f => !/extends\s+(ReadRepository|BaseRepository|AppendOnlyRepository)\b/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('los services de clase exportan también la clase para inyectar dependencias en tests (D)', () => {
    const offenders = sourceFiles
      .filter(isService)
      .filter(f => {
        // export default Object.assign(new X(), { X });   (export default new X() sin la clase no vale)
        return /export\s+default\s+new\s+\w+\(/.test(read(f));
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('los services con repositorios los reciben por constructor(deps) (D)', () => {
    const offenders = sourceFiles
      .filter(isService)
      .filter(f => {
        const src = read(f);
        return REPOSITORY_REQUIRE.test(src) && !CONSTRUCTOR_DEPS.test(src);
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
