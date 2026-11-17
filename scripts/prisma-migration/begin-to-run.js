// Codemod (fase 2 de docs/prisma-migration.md): transacciones manuales → unitOfWork.run().
//
//   const tx = await this.unitOfWork.begin();          const { a, b } = await this.unitOfWork.run(async tx => {
//   try {                                                A                // lo que iba antes del commit
//     A                                                  return { a, b }; // lo que B usa de A
//     await tx.commit();                       →       });
//     B                                                B                  // después del commit: fuera
//   } catch (err) {
//     await tx.rollback();
//     throw err;
//   }
//
// Si el catch hace algo más que rollback + throw (loggear, mapear el error) se conserva envolviendo
// run() + B, igual que antes (B también estaba dentro del try). La diferencia buscada: un error en B
// ya no intenta revertir una transacción confirmada (antes `rollback()` sobre un commit hecho lanzaba
// y tapaba el error original).
//
// No convierte (lo reporta para hacerlo a mano): `return` dentro de A, otro commit/rollback dentro de A,
// `finally`, variables `let` declaradas antes del begin y asignadas en A, o un begin sin el try de
// inmediato. Uso: node scripts/prisma-migration/begin-to-run.js <archivos.ts…>
const fs = require('node:fs');
const ts = require('typescript');

const manual = [];
let converted = 0;

function isAwaitCall(node, objName, method) {
  // `await <objName>.<method>()`
  const e = ts.isExpressionStatement(node) ? node.expression : null;
  return !!e && ts.isAwaitExpression(e) && ts.isCallExpression(e.expression) &&
    ts.isPropertyAccessExpression(e.expression.expression) &&
    ts.isIdentifier(e.expression.expression.expression) && e.expression.expression.expression.text === objName &&
    e.expression.expression.name.text === method;
}

function mentions(node, objName, methods) {
  let found = false;
  (function visit(n) {
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === objName && methods.includes(n.name.text)) found = true;
    if (!found) ts.forEachChild(n, visit);
  })(node);
  return found;
}

function hasReturn(nodes) {
  let found = false;
  const visit = n => {
    if (found || ts.isFunctionLike(n)) return; // un return dentro de una función anidada es de esa función
    if (ts.isReturnStatement(n)) { found = true; return; }
    ts.forEachChild(n, visit);
  };
  nodes.forEach(visit);
  return found;
}

function declaredNames(stmts) {
  const out = new Map(); // nombre → 'const' | 'let'
  for (const s of stmts) {
    if (!ts.isVariableStatement(s)) continue;
    const kind = s.declarationList.flags & ts.NodeFlags.Let ? 'let' : 'const';
    for (const d of s.declarationList.declarations) {
      const add = name => {
        if (ts.isIdentifier(name)) out.set(name.text, kind);
        else name.elements.forEach(el => !ts.isOmittedExpression(el) && add(el.name));
      };
      add(d.name);
    }
  }
  return out;
}

function usedIdentifiers(nodes) {
  const out = new Set();
  const visit = n => {
    if (ts.isIdentifier(n) && !(n.parent && ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) &&
        !(n.parent && ts.isPropertyAssignment(n.parent) && n.parent.name === n)) out.add(n.text);
    if (ts.isShorthandPropertyAssignment(n)) out.add(n.name.text);
    ts.forEachChild(n, visit);
  };
  nodes.forEach(visit);
  return out;
}

const indentOf = (text, pos) => text.slice(text.lastIndexOf('\n', pos - 1) + 1, pos).match(/^\s*/)[0];
const reindent = (text, by) => text.split('\n').map(l => (l.trim() ? by + l : l)).join('\n');

for (const file of process.argv.slice(2)) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  const src = raw.replace(/\r\n/g, '\n');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const edits = [];

  (function visit(n) {
    if (ts.isBlock(n) || ts.isSourceFile(n) || ts.isCaseClause(n)) {
      const stmts = n.statements;
      stmts.forEach((st, i) => {
        // const tx = await <x>.unitOfWork.begin();
        if (!ts.isVariableStatement(st) || st.declarationList.declarations.length !== 1) return;
        const d = st.declarationList.declarations[0];
        const init = d.initializer;
        if (!init || !ts.isAwaitExpression(init) || !ts.isCallExpression(init.expression)) return;
        const callee = init.expression.expression;
        if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'begin' || !/unitOfWork$/i.test(callee.expression.getText(sf))) return;
        const line = sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1;
        const where = `${file}:${line}`;
        if (!ts.isIdentifier(d.name)) return manual.push(`${where}: begin sin identificador simple`);
        const tx = d.name.text;
        const uow = callee.expression.getText(sf);
        const tryStmt = stmts[i + 1];
        if (!tryStmt || !ts.isTryStatement(tryStmt)) return manual.push(`${where}: begin() sin try inmediato`);
        if (tryStmt.finallyBlock) return manual.push(`${where}: try con finally`);
        const body = [...tryStmt.tryBlock.statements];
        const k = body.findIndex(s => isAwaitCall(s, tx, 'commit'));
        if (k < 0) return manual.push(`${where}: no hay \`await ${tx}.commit()\` al nivel del try`);
        const A = body.slice(0, k);
        const B = body.slice(k + 1);
        if (A.some(s => mentions(s, tx, ['commit', 'rollback'])) || B.some(s => mentions(s, tx, ['commit', 'rollback', 'begin']))) {
          return manual.push(`${where}: commit/rollback adicionales dentro del try`);
        }
        if (hasReturn(A)) return manual.push(`${where}: return antes del commit`);
        const cc = tryStmt.catchClause;
        const catchStmts = cc ? [...cc.block.statements] : [];
        const rb = catchStmts.findIndex(s => mentions(s, tx, ['rollback']));
        if (!cc || rb < 0) return manual.push(`${where}: catch sin rollback`);
        const rest = catchStmts.filter((_, j) => j !== rb);
        if (rest.some(s => mentions(s, tx, ['rollback', 'commit', 'finished']))) return manual.push(`${where}: catch usa la transacción`);
        // Declaraciones de A que B usa → se devuelven desde run()
        const declared = declaredNames(A);
        const used = usedIdentifiers(B);
        const needed = [...declared.keys()].filter(nm => used.has(nm));
        // B o el catch no pueden usar la transacción (ya no existe fuera de run)
        if (used.has(tx)) return manual.push(`${where}: el código posterior al commit usa \`${tx}\``);

        const ind = indentOf(src, st.getStart(sf));
        const inner = `${ind}  `;
        const aText = A.map(s => src.slice(s.getFullStart(), s.getEnd())).join('').replace(/^\n+/, '');
        const bodyA = aText ? reindent(aText.split('\n').map(l => l.replace(new RegExp(`^${ind}  `), '')).join('\n'), inner) : '';
        let ret = '';
        let head = `await ${uow}.run(async ${tx} => {`;
        if (needed.length === 1) {
          ret = `\n${inner}return ${needed[0]};`;
          head = `${declared.get(needed[0]) === 'let' ? 'let' : 'const'} ${needed[0]} = ${head}`;
        } else if (needed.length > 1) {
          ret = `\n${inner}return { ${needed.join(', ')} };`;
          const kw = needed.some(nm => declared.get(nm) === 'let') ? 'let' : 'const';
          head = `${kw} { ${needed.join(', ')} } = ${head}`;
        }
        const runBlock = `${head}\n${bodyA}${ret}\n${ind}});`;
        const bText = B.map(s => src.slice(s.getFullStart(), s.getEnd())).join('');
        const restIsRethrow = rest.length === 1 && ts.isThrowStatement(rest[0]) && cc.variableDeclaration &&
          ts.isIdentifier(rest[0].expression) && rest[0].expression.text === cc.variableDeclaration.name.getText(sf);
        let out;
        if (restIsRethrow || rest.length === 0) {
          // B estaba en el try solo para el rollback: queda al mismo nivel
          const bDedent = bText.split('\n').map(l => l.replace(new RegExp(`^${ind}  `), ind)).join('\n');
          out = `${runBlock}${bDedent}`;
        } else {
          const catchVar = cc.variableDeclaration ? ` (${cc.variableDeclaration.getText(sf)})` : '';
          const restText = rest.map(s => src.slice(s.getFullStart(), s.getEnd())).join('');
          out = `try {\n${reindent(runBlock, '  ')}${bText}\n${ind}} catch${catchVar} {${restText}\n${ind}}`;
        }
        edits.push({ pos: st.getStart(sf), end: tryStmt.getEnd(), text: out });
        converted++;
      });
    }
    ts.forEachChild(n, visit);
  })(sf);

  if (!edits.length) continue;
  let s = src;
  edits.sort((a, b) => b.pos - a.pos).forEach(e => { s = s.slice(0, e.pos) + e.text + s.slice(e.end); });
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
}

console.log(`${converted} convertidos`);
if (manual.length) console.log(`\nA mano (${manual.length}):\n  - ${manual.join('\n  - ')}`);
