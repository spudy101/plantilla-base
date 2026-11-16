// scripts/ts-migration/class-deps.js
//
// Clases con inyección por constructor (patrón del proyecto):
//   constructor(deps = {}) {
//     this.userRepository = deps.userRepository ?? userRepository;
//   }
// En TS cada `this.x` necesita su campo declarado. El codemod:
//   - declara `x: typeof userRepository;` (el tipo del default real),
//   - genera `namespace Clase { export interface Deps { userRepository?: typeof userRepository } }`
//     (o agrega a uno existente) y tipa `constructor(deps: Clase.Deps = {})`.
// Solo toca asignaciones de una línea `this.a = deps.b ?? <identificador o a.b>;`. Las demás
// (multilínea, `new X(...)`, literales) se reportan para declararlas a mano.
//
// Uso: node scripts/ts-migration/class-deps.js <archivos.ts…>
const fs = require('node:fs');

const ASSIGN = /^ {4}this\.(\w+) = deps\.(\w+) \?\? ([\w$]+(?:\.[\w$]+)*);$/;

for (const file of process.argv.slice(2)) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');
  const report = [];
  let changed = false;

  for (const cls of [...s.matchAll(/^class (\w+)(?: extends [\w.<>]+)? \{$/gm)].map(m => m[1])) {
    const classStart = s.search(new RegExp(`^class ${cls}\\b`, 'm'));
    const ctorRe = /^ {2}constructor\(deps = \{\}\) \{$/m;
    const rest = s.slice(classStart);
    const ctorMatch = rest.match(ctorRe);
    // El constructor tiene que ser de ESTA clase (antes de la próxima `class`)
    const nextClass = rest.slice(1).search(/^class \w+/m);
    if (!ctorMatch || (nextClass >= 0 && ctorMatch.index > nextClass + 1)) {
      continue;
    }
    const ctorAt = classStart + ctorMatch.index;
    const bodyEnd = s.indexOf('\n  }\n', ctorAt);
    const body = s.slice(ctorAt, bodyEnd);

    const fields = [];
    for (const line of body.split('\n')) {
      const m = line.match(ASSIGN);
      if (m && m[3] !== 'null' && m[3] !== 'undefined') {
        fields.push({ name: m[1], key: m[2], type: `typeof ${m[3]}` });
      } else if (/^ {4}this\.\w+ =/.test(line)) {
        report.push(`${cls}: ${line.trim()}`);
      }
    }
    if (!fields.length) {
      continue;
    }

    // constructor tipado + campos declarados ANTES del comentario del constructor (JSDoc o //)
    const decl = fields.map(f => `  ${f.name}: ${f.type};`).join('\n');
    const before = s.slice(0, ctorAt);
    const docMatch = before.match(/(?:\n {2}\/\*\*(?:(?!\*\/)[\s\S])*?\*\/|(?:\n {2}\/\/[^\n]*)+)\n$/);
    const insertAt = docMatch ? ctorAt - docMatch[0].length + 1 : ctorAt;
    s =
      s.slice(0, insertAt) +
      `${decl}\n\n` +
      s.slice(insertAt, ctorAt) +
      `  constructor(deps: ${cls}.Deps = {}) {` +
      s.slice(ctorAt + ctorMatch[0].length);

    // interfaz Deps en el namespace de la clase
    const depsLines = [...new Map(fields.map(f => [f.key, f.type]))].map(([k, t]) => `    ${k}?: ${t};`).join('\n');
    const nsRe = new RegExp(`^namespace ${cls} \\{\\n`, 'm');
    if (nsRe.test(s)) {
      s = s.replace(nsRe, m => `${m}  export interface Deps {\n${depsLines}\n  }\n\n`);
    } else {
      const exp = s.search(/^export = /m);
      const ns = `// eslint-disable-next-line @typescript-eslint/no-namespace\nnamespace ${cls} {\n  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */\n  export interface Deps {\n${depsLines}\n  }\n}\n\n`;
      s = exp >= 0 ? s.slice(0, exp) + ns + s.slice(exp) : `${s.trimEnd()}\n\n${ns}`;
    }
    changed = true;
    console.log(`${file}: ${cls} (${fields.length} deps)`);
  }

  if (changed) {
    fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
  }
  for (const r of report) {
    console.log(`   ⚠ a mano: ${r}`);
  }
}
