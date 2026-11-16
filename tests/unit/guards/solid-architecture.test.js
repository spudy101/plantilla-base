// tests/unit/guards/solid-architecture.test.js
//
// Guardas de arquitectura (análisis estático, sin cargar módulos). Hacen cumplir las reglas de
// docs/solid.md para que no se pierdan con el tiempo. Si una falla, la corrección casi siempre es
// mover la consulta/enum/include al repositorio o a shared/constants — no ampliar el allowlist.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : walk(full);
    }
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const rel = file => path.relative(ROOT, file).split(path.sep).join('/');
const read = file => fs.readFileSync(file, 'utf8');
const sourceFiles = [...walk(path.join(ROOT, 'modules')), ...walk(path.join(ROOT, 'shared'))];

// Capa de aplicación: lo que NO debe conocer el ORM.
const APPLICATION_LAYER = /\.(service|helper|validator|controller|middleware|util)\.js$/;

// Adaptadores de infraestructura que escriben/arrancan con Sequelize a propósito (ver docs/solid.md § D).
const ORM_ALLOWLIST = new Set([
  'shared/utils/logger.util.js', // escribe audit_logs (require diferido: el resto del sistema depende del logger)
  'shared/utils/integration-api-logger.util.js' // escribe integration_api_logs (mismo motivo)
]);

const MODELS_REQUIRE = /require\(\s*['"][^'"]*(?:shared\/models|\.\.\/models)['"]\s*\)/;
const SEQUELIZE_REQUIRE = /require\(\s*['"]sequelize['"]\s*\)/;

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
      .filter(f => f.endsWith('.service.js'))
      .filter(f => /\bmodel:\s*[A-Z]\w*/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('todo repositorio pertenece a la jerarquía Read/Base/AppendOnly (L)', () => {
    const offenders = sourceFiles
      .filter(f => f.endsWith('.repository.js') && !rel(f).startsWith('shared/repositories/'))
      .filter(f => !/extends\s+(ReadRepository|BaseRepository|AppendOnlyRepository)\b/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('los services de clase exportan también la clase para inyectar dependencias en tests (D)', () => {
    const offenders = sourceFiles
      .filter(f => f.endsWith('.service.js'))
      .filter(f => {
        const src = read(f);
        const instance = src.match(/module\.exports\s*=\s*new\s+(\w+)\(/);
        return instance && !new RegExp(`module\\.exports\\.${instance[1]}\\s*=\\s*${instance[1]}`).test(src);
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('los services con repositorios los reciben por constructor(deps) (D)', () => {
    const offenders = sourceFiles
      .filter(f => f.endsWith('.service.js'))
      .filter(f => {
        const src = read(f);
        return /require\([^)]*\.repository['"]\)/.test(src) && !/constructor\(deps = \{\}\)/.test(src);
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
