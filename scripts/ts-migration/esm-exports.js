// Codemod (fase 6): `export =` / `import x = require()` → import/export nativos de ES.
// Con todo el código en TS ya no quedan consumidores CommonJS, así que:
//   export = expr;                         → export default expr;      (mismo valor, ahora en .default)
//   import X = require('./m')              → import X from './m'        (m exportaba con export =)
//   import X = require('./m')              → import * as X from './m'   (m ya tenía exports nativos)
//   import pkgModule = require('pkg');\nconst { a, b: c } = pkgModule;  → import { a, b as c } from 'pkg';
//   import X = require('pkg')              → import X from 'pkg'        (esModuleInterop: el mismo objeto que require)
//   import type X = require('./m')         → import type X from './m'
//   require('./m')  /  jest.requireActual('./m')  /  jest.requireMock('./m')   → … .default
//   (require('./m') as typeof import('./m'))     → (require('./m') as typeof import('./m')).default
//   typeof import('./m')  (en tipos)              → typeof import('./m').default
// Los archivos de KEEP siguen con `export =` (los carga una herramienta externa que espera module.exports).
// Uso: node scripts/ts-migration/esm-exports.js   (sobre todo lo que incluye tsconfig.test.json)
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = process.cwd();
// sequelize-cli la carga con import(): un `export default` le llegaría envuelto dos veces
const KEEP = new Set(['config/database.ts']);
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');

const cfg = ts.readConfigFile(path.join(ROOT, 'tsconfig.test.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);
const program = ts.createProgram(parsed.fileNames, parsed.options);
program.getTypeChecker(); // enlaza los archivos: deja puestos los `parent` de cada nodo
const projectFiles = program.getSourceFiles().filter(sf => !sf.isDeclarationFile && !rel(sf.fileName).startsWith('node_modules/') && !rel(sf.fileName).startsWith('..'));

const hasExportAssignment = sf => sf.statements.some(s => ts.isExportAssignment(s) && s.isExportEquals);
const converted = new Set(projectFiles.filter(sf => hasExportAssignment(sf) && !KEEP.has(rel(sf.fileName))).map(sf => sf.fileName));
const exportEquals = new Set(projectFiles.filter(hasExportAssignment).map(sf => sf.fileName));

function resolve(spec, fromFile) {
  const r = ts.resolveModuleName(spec, fromFile, parsed.options, ts.sys).resolvedModule;
  if (!r) return { kind: 'unknown' };
  const file = path.resolve(r.resolvedFileName);
  if (r.isExternalLibraryImport || /node_modules/.test(file)) return { kind: 'external' };
  if (file.endsWith('.json')) return { kind: 'json' };
  const norm = program.getSourceFile(file)?.fileName ?? file;
  if (exportEquals.has(norm)) return { kind: 'default', converted: converted.has(norm) };
  return { kind: 'namespace' };
}

const isRequireCall = n =>
  ts.isCallExpression(n) && n.arguments.length === 1 && ts.isStringLiteral(n.arguments[0]) &&
  ((ts.isIdentifier(n.expression) && n.expression.text === 'require') ||
    (ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) &&
      n.expression.expression.text === 'jest' && ['requireActual', 'requireMock'].includes(n.expression.name.text)));

const report = { exports: 0, imports: 0, named: 0, lazy: 0, types: 0, unknown: [] };

for (const sf of projectFiles) {
  const text = sf.getFullText();
  const edits = []; // { pos, end, text }
  const handled = new Set();

  // 1) export = expr;
  if (converted.has(sf.fileName)) {
    for (const st of sf.statements) {
      if (ts.isExportAssignment(st) && st.isExportEquals) {
        edits.push({ pos: st.getStart(sf), end: st.expression.getStart(sf), text: 'export default ' });
        report.exports++;
      }
    }
  }

  // 2) import X = require('m')
  const statements = sf.statements;
  statements.forEach((st, i) => {
    if (!ts.isImportEqualsDeclaration(st) || !ts.isExternalModuleReference(st.moduleReference)) return;
    const spec = st.moduleReference.expression.text;
    const q = sf.text[st.moduleReference.expression.getStart(sf)];
    const name = st.name.text;
    const typeOnly = st.isTypeOnly ? 'type ' : '';
    const target = resolve(spec, sf.fileName);
    const start = st.getStart(sf);
    const end = st.getEnd();
    report.imports++;

    if (target.kind === 'external' && !typeOnly) {
      // alias usado solo para desestructurar en la sentencia siguiente → import con nombre
      const next = statements[i + 1];
      const uses = (sf.text.match(new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g')) || []).length;
      if (next && ts.isVariableStatement(next) && uses === 2 && next.declarationList.declarations.length === 1) {
        const d = next.declarationList.declarations[0];
        if (ts.isObjectBindingPattern(d.name) && d.initializer && ts.isIdentifier(d.initializer) && d.initializer.text === name &&
            d.name.elements.every(e => !e.dotDotDotToken && !e.initializer && ts.isIdentifier(e.name) && (!e.propertyName || ts.isIdentifier(e.propertyName)))) {
          const specs = d.name.elements.map(e => (e.propertyName ? `${e.propertyName.text} as ${e.name.text}` : e.name.text));
          edits.push({ pos: start, end: next.getEnd(), text: `import { ${specs.join(', ')} } from ${q}${spec}${q};` });
          report.named++;
          return;
        }
      }
    }
    if (target.kind === 'unknown') report.unknown.push(`${rel(sf.fileName)}: ${spec}`);
    const form = target.kind === 'namespace' ? `* as ${name}` : name;
    edits.push({ pos: start, end, text: `import ${typeOnly}${form} from ${q}${spec}${q};` });
  });

  // 3) require() diferidos, jest.requireActual() y typeof import() hacia módulos convertidos.
  //    Un require('m') diferido pasa por interopDefault(): si `m` es un jest.mock con factory, el objeto
  //    del mock no tiene `.default` (import x from 'm' lo resuelve con esModuleInterop; esto igual).
  //    jest.requireMock() devuelve justamente el mock: no se toca.
  let needsInterop = false;
  const isPlainRequire = n => isRequireCall(n) && ts.isIdentifier(n.expression);
  (function visit(n) {
    if (handled.has(n)) return;
    if (ts.isAsExpression(n) && isPlainRequire(n.expression) && ts.isImportTypeNode(n.type) && n.type.isTypeOf && !n.type.qualifier) {
      const t = resolve(n.expression.arguments[0].text, sf.fileName);
      if (t.kind === 'default' && t.converted) {
        const wrapped = ts.isParenthesizedExpression(n.parent) ? n.parent : n;
        edits.push({ pos: wrapped.getStart(sf), end: wrapped.getEnd(), text: `interopDefault(${n.getText(sf)})` });
        needsInterop = true;
        report.lazy++;
        return;
      }
    }
    if (isRequireCall(n) && !(n.parent && ts.isExternalModuleReference(n.parent))) {
      const spec = n.arguments[0].text;
      const t = resolve(spec, sf.fileName);
      if (t.kind === 'default' && t.converted) {
        const q = sf.text[n.arguments[0].getStart(sf)];
        if (isPlainRequire(n)) {
          edits.push({ pos: n.getStart(sf), end: n.getEnd(), text: `interopDefault(require(${q}${spec}${q}) as typeof import(${q}${spec}${q}))` });
          needsInterop = true;
        } else if (n.expression.name.text === 'requireActual') {
          edits.push({ pos: n.getEnd(), end: n.getEnd(), text: '.default' });
        }
        report.lazy++;
      }
    }
    if (ts.isImportTypeNode(n) && n.isTypeOf && !n.qualifier && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) {
      const t = resolve(n.argument.literal.text, sf.fileName);
      if (t.kind === 'default' && t.converted) {
        edits.push({ pos: n.getEnd(), end: n.getEnd(), text: '.default' });
        report.types++;
      }
    }
    ts.forEachChild(n, visit);
  })(sf);

  if (!edits.length) continue;
  if (needsInterop) {
    // antes del primer import: así está cargado aunque se use en código de nivel superior
    const relFile = rel(sf.fileName);
    let from = path.relative(path.dirname(sf.fileName), path.join(ROOT, 'shared/utils/interop.util')).replace(/\\/g, '/');
    if (relFile.startsWith('tests/')) from = 'shared/utils/interop.util';
    else if (!from.startsWith('.')) from = `./${from}`;
    const first = sf.statements.find(s => ts.isImportDeclaration(s) || ts.isImportEqualsDeclaration(s));
    const at = first ? first.getStart(sf) : sf.statements[0]?.getStart(sf) ?? 0;
    edits.push({ pos: at, end: at, text: `import { interopDefault } from '${from}';\n` });
  }
  let out = text;
  edits.sort((a, b) => b.pos - a.pos || b.end - a.end);
  for (const e of edits) out = out.slice(0, e.pos) + e.text + out.slice(e.end);
  fs.writeFileSync(sf.fileName, out);
}

console.log(JSON.stringify({ ...report, unknown: report.unknown.slice(0, 20), unknownCount: report.unknown.length }, null, 2));
