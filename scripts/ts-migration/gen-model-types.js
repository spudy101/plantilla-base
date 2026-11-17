// scripts/ts-migration/gen-model-types.js
//
// Convierte las factories de modelos Sequelize (modules/**/models/*.model.ts, ya pasadas por cjs-to-ts) a
// TypeScript tipado, generando los tipos DESDE LA DEFINICIÓN REAL que Sequelize carga en runtime
// (rawAttributes, allowNull, defaultValue, associations). Así los tipos no pueden desincronizarse de la
// columna.
//
// Por modelo genera, en un namespace fusionado con la factory:
//   Attributes          columnas (ENUM → unión de literales; nullable → | null)
//   CreationAttributes  Optional<Attributes, PK con default | defaults | nullable | timestamps>
//   Instance            Model<…> & Attributes & asociaciones (person?: definePerson.Instance, …)
//   Static              ModelStatic<Instance> & { associate?(models: Registry) }
// y regenera shared/models/index.ts con el registro tipado (Registry).
//
// Uso (desde la raíz, con tsx porque los modelos ya son .ts):
//   npx tsx scripts/ts-migration/gen-model-types.js
//
// Lo que NO genera (se agrega a mano): métodos de instancia (X.prototype.foo) y estáticos propios
// (X.STATUS). El script los reporta al final. Se declaran en un namespace MANUAL antes del bloque
// generado (declaration merging), que el script conserva al regenerar:
//   namespace defineX {
//     export interface Instance { isPending(): boolean }        // se fusiona con la Instance generada
//     export interface StaticExtensions { STATUS: typeof STATUS } // el script lo suma a Static
//   }
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const rel = (from, to) => {
  let r = path.relative(path.dirname(from), to).split(path.sep).join('/').replace(/\.ts$/, '');
  return r.startsWith('.') ? r : `./${r}`;
};

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : e.name.endsWith('.model.ts') ? [full] : [];
  });
}

// ── Tipo TS de una columna a partir del DataType de Sequelize ──
function tsType(def) {
  const key = def.type?.key;
  switch (key) {
    case 'STRING':
    case 'TEXT':
    case 'CHAR':
    case 'CITEXT':
    case 'UUID':
    case 'TIME':
    case 'DATEONLY': // Sequelize devuelve 'YYYY-MM-DD'
    case 'DECIMAL': // pg devuelve DECIMAL como string para no perder precisión
    case 'BIGINT':
    case 'INET':
      return 'string';
    case 'INTEGER':
    case 'SMALLINT':
    case 'FLOAT':
    case 'DOUBLE':
    case 'REAL':
      return 'number';
    case 'BOOLEAN':
      return 'boolean';
    case 'DATE':
      return 'Date';
    case 'ENUM':
      return def.type.values.map(v => `'${v}'`).join(' | ');
    case 'JSON':
    case 'JSONB':
      return 'unknown'; // forma libre: quien la lee la describe (DTO / servicio)
    case 'ARRAY': {
      const inner = tsType({ type: def.type.type });
      return inner.includes('|') ? `Array<${inner}>` : `${inner}[]`;
    }
    default:
      throw new Error(`Tipo de columna no soportado: ${key}`);
  }
}

const isTimestamp = (model, attr) => {
  const o = model.options;
  return [o.createdAt === false ? null : o.createdAt || 'createdAt', o.updatedAt === false ? null : o.updatedAt || 'updatedAt', o.deletedAt || 'deletedAt']
    .filter(Boolean)
    .includes(attr);
};

function main() {
  const dbModule = require(path.join(ROOT, 'shared/models'));
  const db = dbModule.default ?? dbModule;
  const files = walk(path.join(ROOT, 'modules'));
  const byModel = new Map();
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    // también reconoce los ya convertidos: sequelize.define<defineX.Instance>('X', …)
    const m = src.match(/sequelize\.define(?:<[^>]+>)?\(\s*'(\w+)'/);
    if (m) byModel.set(m[1], file);
  }

  const notes = [];
  for (const [name, file] of byModel) {
    const model = db[name];
    if (!model?.rawAttributes) throw new Error(`Modelo ${name} no está en shared/models`);
    const fn = `define${name}`;
    const raw = fs.readFileSync(file, 'utf8');
    const crlf = raw.includes('\r\n');
    let s = raw.replace(/\r\n/g, '\n');
    // Ya convertido en una corrida anterior → solo se regeneran los tipos (imports + namespace).
    const converted = s.includes(`function ${fn}(sequelize: Sequelize)`);
    if (converted) {
      const marker = s.indexOf('\n// Tipos del modelo (generados');
      if (marker < 0) throw new Error(`${file}: convertido pero sin bloque de tipos generado`);
      s = s.slice(0, marker).trimEnd() + '\n';
      s = s.replace(/^import type \{ Model as SequelizeModel[^\n]*\n/m, '');
      s = s.replace(/^import type \{ ModelRegistry \}[^\n]*\n/m, '');
      s = s.replace(/^import type define\w+ (?:= require\(|from )[^\n]*\n/gm, '');
    }

    // ── Columnas ── (los timestamps automáticos van en Attributes como OPCIONALES: define<M>() exige
    //    declarar en el objeto de columnas toda Attribute obligatoria, y Sequelize los agrega solo)
    const attrLines = [];
    const optional = [];
    const timestampLines = [];
    for (const [attr, def] of Object.entries(model.rawAttributes)) {
      const nullable = def.allowNull !== false && !def.primaryKey;
      const base = tsType(def);
      // unknown ya incluye null: `unknown | null` es redundante
      const type = base + (nullable && base !== 'unknown' ? ' | null' : '');
      if (def._autoGenerated && isTimestamp(model, attr)) {
        timestampLines.push(`    /** Timestamp gestionado por Sequelize */\n    readonly ${attr}: ${type};`);
        // En Attributes como opcional: define<M>() no lo exige en las columnas, pero where/order lo aceptan
        attrLines.push(`    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */\n    ${attr}?: ${type};`);
        optional.push(attr);
        continue;
      }
      const comment = def.comment ? `    /** ${String(def.comment).replace(/\*\//g, '* /')} */\n` : '';
      attrLines.push(`${comment}    ${attr}: ${type};`);
      if (def.defaultValue !== undefined || def.autoIncrement || nullable || isTimestamp(model, attr)) optional.push(attr);
    }

    // ── Asociaciones ──
    const imports = new Map();
    const assocLines = [];
    for (const [as, a] of Object.entries(model.associations)) {
      const target = a.target.name;
      const targetFile = byModel.get(target);
      if (!targetFile) throw new Error(`Asociación ${name}.${as} → ${target} sin archivo`);
      const ref = target === name ? `${fn}.Instance` : `define${target}.Instance`;
      if (target !== name) imports.set(`define${target}`, rel(file, targetFile));
      const many = a.associationType === 'HasMany' || a.associationType === 'BelongsToMany';
      assocLines.push(`    /** ${a.associationType} → ${target} (solo si viene en el include) */\n    ${as}?: ${many ? `${ref}[]` : `${ref} | null`};`);
    }

    // ── Reescritura de la factory ── (solo la primera vez)
    if (!converted) {
    const header = /^export (?:=|default) sequelize => \{$/m;
    if (!header.test(s)) throw new Error(`${file}: no encontré "export default sequelize => {"`);
    s = s.replace(header, `function ${fn}(sequelize: Sequelize): ${fn}.Static {`);
    const defineRe = new RegExp(`const ${name} = sequelize\\.define\\(`);
    const at = s.search(defineRe);
    if (at < 0) throw new Error(`${file}: no encontré const ${name} = sequelize.define(`);
    s = s.replace(defineRe, `const ${name} = sequelize.define<${fn}.Instance>(`);
    const close = s.indexOf('\n  );\n', at);
    if (close < 0) throw new Error(`${file}: no encontré el cierre "  );" del define`);
    s = s.slice(0, close) + `\n  ) as ${fn}.Static;\n` + s.slice(close + '\n  );\n'.length);
    const tail = s.lastIndexOf('\n};');
    if (tail < 0) throw new Error(`${file}: no encontré el cierre de la factory`);
    s = s.slice(0, tail) + '\n}\n';
    }

    const ns = `

// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace ${fn} {
  /** Columnas de ${model.getTableName().tableName ?? model.getTableName()}. */
  export interface Attributes {
${attrLines.join('\n')}
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, ${optional.length ? optional.map(o => `'${o}'`).join(' | ') : 'never'}>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
${[...timestampLines, ...assocLines].join('\n') || '    // sin timestamps ni asociaciones'}
  }

  export type Static = ModelStatic<Instance> & ${/interface StaticExtensions\b/.test(s) ? 'StaticExtensions & ' : ''}{
    associate?: (models: ModelRegistry) => void;
  };
}

export default ${fn};
`;
    s = s.trimEnd() + '\n' + ns;

    // ── Imports de tipos ──
    const typeImports = [
      "import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';",
      `import type { ModelRegistry } from '${rel(file, path.join(ROOT, 'shared/models/registry.ts'))}';`,
      ...[...imports].sort().map(([id, p]) => `import type ${id} from '${p}';`)
    ].join('\n');
    const lastImport = [...s.matchAll(/^(?:import .*;|const .* = [\w$]+Module(?:\.[\w$]+)?;)$/gm)].pop();
    const pos = lastImport ? lastImport.index + lastImport[0].length : 0;
    s = s.slice(0, pos) + '\n' + typeImports + '\n' + s.slice(pos);
    // al regenerar quedan los saltos de línea de los imports quitados: una sola línea en blanco antes
    // de la factory (sin esto cada corrida sumaba una)
    s = s.replace(/\n{3,}(?=(?:\/\/[^\n]*\n|\/\*\*[\s\S]*?\*\/\n)*(?:function define|export (?:=|default) sequelize))/, '\n\n');

    if (/\.prototype\.\w+\s*=/.test(s)) notes.push(`${name}: métodos de instancia (prototype) → agregarlos a ${fn}.Instance`);
    const statics = [...s.matchAll(new RegExp(`^\\s+${name}\\.(\\w+) =`, 'gm'))].map(x => x[1]).filter(x => x !== 'associate');
    if (statics.length) notes.push(`${name}: estáticos ${statics.join(', ')} → agregarlos a ${fn}.Static`);

    fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
    console.log(`${path.relative(ROOT, file)}  (${Object.keys(model.rawAttributes).length} columnas, ${assocLines.length} asociaciones)`);
  }

  // ── Registro tipado ──
  const regFile = path.join(ROOT, 'shared/models/registry.ts');
  const names = [...byModel.keys()].sort();
  const reg = `// shared/models/registry.ts
//
// Registro tipado de modelos (generado con scripts/ts-migration/gen-model-types.js). Solo tipos: el
// valor lo arma shared/models/index.ts. Separado del índice para que los modelos puedan referenciarlo
// (en associate) sin ciclos de carga.
import type { Sequelize } from 'sequelize';
${names.map(n => `import type define${n} from '${rel(regFile, byModel.get(n))}';`).join('\n')}

export interface ModelRegistry {
  sequelize: Sequelize;
  Sequelize: typeof import('sequelize').Sequelize;
${names.map(n => `  ${n}: define${n}.Static;`).join('\n')}
}
`;
  fs.writeFileSync(regFile, reg);
  console.log(`\n${path.relative(ROOT, regFile)}: ${names.length} modelos`);
  if (notes.length) console.log('\nRevisar a mano:\n  - ' + notes.join('\n  - '));
  process.exit(0);
}

main();
