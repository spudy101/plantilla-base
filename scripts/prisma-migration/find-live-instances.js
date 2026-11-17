// Inventario (fase 3 de docs/prisma-migration.md): llamadas a métodos de una INSTANCIA de modelo de
// Sequelize (`record.update()`, `reload()`, `save()`, `destroy()`, `increment()`, `get()`…) fuera de los
// repositorios y los modelos. Prisma devuelve objetos planos: cada una tiene que pasar a ser un método
// del repositorio antes de cambiar de ORM. Usa el type checker: el receptor es una instancia si su tipo
// tiene `dataValues` (lo define Model de Sequelize).
// Uso: node scripts/prisma-migration/find-live-instances.js [--json]
//      npm run check:orm   (sale con código 1 si encuentra alguna: corre en CI)
const path = require('node:path');
const ts = require('typescript');

const ROOT = process.cwd();
const cfg = ts.readConfigFile(path.join(ROOT, 'tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');
const SKIP = /(\.repository\.ts|\/models\/|\/repositories\/|\/generated\/|\/database\/)/;

const hits = [];
for (const sf of program.getSourceFiles()) {
  const file = rel(sf.fileName);
  if (sf.isDeclarationFile || file.startsWith('node_modules') || file.startsWith('..') || SKIP.test(file)) continue;
  (function visit(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const recvType = checker.getTypeAtLocation(n.expression.expression);
      const nonNull = checker.getNonNullableType(recvType);
      const types = nonNull.isUnion() ? nonNull.types : [nonNull];
      if (types.some(t => t.getProperty('dataValues') && t.getProperty('isNewRecord'))) {
        const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
        hits.push({ file, line: line + 1, call: `${n.expression.expression.getText(sf)}.${n.expression.name.text}()` });
      }
    }
    ts.forEachChild(n, visit);
  })(sf);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(hits, null, 2));
} else {
  for (const h of hits) console.log(`${h.file}:${h.line}  ${h.call}`);
  console.log(`\n${hits.length} llamadas en ${new Set(hits.map(h => h.file)).size} archivos`);
}
if (hits.length > 0) {
  console.error('\nMétodos de instancias de modelo fuera de los repositorios: pasarlos a un método del repositorio (docs/prisma-migration.md, fase 3).');
  process.exitCode = 1;
}
