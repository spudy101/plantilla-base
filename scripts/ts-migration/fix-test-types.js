// Fixer de tipos para tests .ts (fase 6). Corre el typecheck de tsconfig.test.json y, solo dentro de
// tests/, resuelve los errores mecánicos con los helpers de tests/helpers/mock.ts:
//   - parámetro / `let` sin tipo (TS7006, TS7031, TS7034, TS7005)  → `: Loose`
//     (si el `let` se asigna una sola vez con un tipo concreto, se usa ese tipo)
//   - fixture parcial pasado al código bajo prueba (TS2345, TS2322, TS2739, TS2740, TS2741, TS2353,
//     TS2559) → `fixture(…)`
//   - `const x = {}` que después recibe propiedades (TS2339 sobre `{}`) → `const x: Loose = {}`
// Agrega los imports que falten. Repetir hasta que no cambie nada; el resto se tipa a mano.
// Uso: node scripts/ts-migration/fix-test-types.js [prefijo]   (por defecto: tests/)
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = process.cwd();
const prefix = (process.argv[2] || 'tests/').replace(/\\/g, '/');
const HELPER = 'tests/helpers/mock';

function loadProgram() {
  const cfgPath = path.join(ROOT, 'tsconfig.test.json');
  const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);
  return ts.createProgram(parsed.fileNames, parsed.options);
}

function findNode(sf, pos) {
  let found;
  (function visit(n) {
    if (pos >= n.getStart(sf) && pos < n.getEnd()) {
      found = n;
      ts.forEachChild(n, visit);
    }
  })(sf);
  return found;
}

function callArgument(node) {
  let n = node;
  while (n.parent) {
    const p = n.parent;
    if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.arguments && p.arguments.includes(n)) return n;
    if (ts.isStatement(p) || ts.isFunctionLike(p)) return null;
    n = p;
  }
  return null;
}

function run() {
  const program = loadProgram();
  const checker = program.getTypeChecker();
  const edits = new Map(); // file → [{pos, end?, text, kind}]
  const add = (sf, e) => {
    const list = edits.get(sf.fileName) || [];
    if (!list.some(x => x.pos === e.pos && x.kind === e.kind)) list.push(e);
    edits.set(sf.fileName, list);
  };
  const annotate = (sf, decl) => {
    if (decl.type || !decl.name) return;
    let text = ': Loose';
    if (ts.isVariableDeclaration(decl) && !decl.initializer) {
      // un tipo concreto si todas las asignaciones coinciden
      const sym = checker.getSymbolAtLocation(decl.name);
      const types = new Set();
      (function visit(n) {
        if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isIdentifier(n.left) && checker.getSymbolAtLocation(n.left) === sym) {
          const t = checker.getTypeAtLocation(n.right);
          types.add(t.flags & ts.TypeFlags.Any ? 'Loose' : checker.typeToString(checker.getBaseTypeOfLiteralType(t), undefined, ts.TypeFormatFlags.NoTruncation));
        }
        ts.forEachChild(n, visit);
      })(sf);
      const [only] = types;
      if (types.size === 1 && only !== 'Loose' && !/import\(|=>|\{|^(Mock|SpyInstance)\b|\bany\b/.test(only) && only.length < 60) text = `: ${only}`;
    }
    const at = ts.isParameter(decl) && decl.questionToken ? decl.questionToken.getEnd() : decl.name.getEnd();
    // un parámetro solo de arrow sin paréntesis: `x => …` → `(x: Loose) => …`
    if (ts.isParameter(decl) && ts.isArrowFunction(decl.parent) &&
        sf.text[decl.parent.parameters.pos - 1] !== '(' && decl.parent.parameters.length === 1) {
      add(sf, { pos: decl.getStart(sf), end: decl.getEnd(), text: `(${decl.getText(sf)}${text})`, kind: 'paren' });
      return;
    }
    add(sf, { pos: at, text, kind: 'annot' });
  };

  const diags = ts.getPreEmitDiagnostics(program).filter(d =>
    d.file && path.relative(ROOT, d.file.fileName).replace(/\\/g, '/').startsWith(prefix));
  for (const d of diags) {
    const sf = d.file;
    const node = findNode(sf, d.start);
    if (!node) continue;
    switch (d.code) {
      case 7006: case 7031: case 7034: {
        let n = node;
        while (n && !ts.isParameter(n) && !ts.isVariableDeclaration(n)) n = n.parent;
        if (n) annotate(sf, n);
        break;
      }
      case 7005: {
        // `{ transaction }`: el símbolo de la propiedad no es la variable
        const sym = ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
          ? checker.getShorthandAssignmentValueSymbol(node.parent)
          : checker.getSymbolAtLocation(node);
        const decl = sym && sym.valueDeclaration;
        if (decl && decl.getSourceFile() === sf) annotate(sf, decl);
        break;
      }
      case 2345: case 2322: case 2739: case 2740: case 2741: case 2353: case 2559: {
        const arg = callArgument(node);
        if (arg && !ts.isSpreadElement(arg)) add(sf, { pos: arg.getStart(sf), end: arg.getEnd(), text: `fixture(${arg.getText(sf)})`, kind: 'wrap' });
        break;
      }
      case 2339: {
        if (!/on type '\{\}'/.test(ts.flattenDiagnosticMessageText(d.messageText, '\n'))) break;
        const pa = node.parent;
        if (!pa || !ts.isPropertyAccessExpression(pa) || !ts.isIdentifier(pa.expression)) break;
        const sym = checker.getSymbolAtLocation(pa.expression);
        const decl = sym && sym.valueDeclaration;
        if (decl && ts.isVariableDeclaration(decl) && decl.getSourceFile() === sf) annotate(sf, decl);
        break;
      }
      default:
    }
  }

  let changed = 0;
  for (const [file, list] of edits) {
    let s = fs.readFileSync(file, 'utf8');
    // de atrás para adelante; un wrap que contiene a otro se descarta
    list.sort((a, b) => b.pos - a.pos);
    const applied = [];
    // una anotación suelta dentro de un rango que se reescribe entero (`x => …` → `(x: Loose) => …`) sobra
    const ranges = list.filter(e => e.end);
    for (const e of list) {
      if (!e.end && ranges.some(r => e.pos >= r.pos && e.pos <= r.end)) continue;
      if (e.end && applied.some(a => a.pos >= e.pos && a.pos < e.end)) continue;
      s = e.end ? s.slice(0, e.pos) + e.text + s.slice(e.end) : s.slice(0, e.pos) + e.text + s.slice(e.pos);
      applied.push(e);
    }
    const needs = ['Loose', 'fixture'].filter(n => new RegExp(`\\b${n}\\b`).test(s));
    const imp = s.match(new RegExp(`^import \\{([^}]*)\\} from '${HELPER}';`, 'm'));
    const have = imp ? imp[1].split(',').map(x => x.trim().replace(/^type /, '')) : [];
    const missing = needs.filter(n => !have.includes(n));
    if (missing.length || !imp) {
      const names = [...new Set([...have, ...needs])].filter(Boolean);
      const line = `import { ${names.join(', ')} } from '${HELPER}';`;
      if (imp) s = s.replace(imp[0], line);
      else if (names.length) {
        const m = s.match(/^import .*$/m);
        s = m ? s.replace(m[0], `${line}\n${m[0]}`) : `${line}\n${s}`;
      }
    }
    fs.writeFileSync(file, s);
    changed++;
  }
  console.log(`${diags.length} diagnósticos, ${changed} archivos editados`);
  return changed;
}

let rounds = 0;
while (run() && ++rounds < 5);
