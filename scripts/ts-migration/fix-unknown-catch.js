// Fixer: para cada error TS18046 "'X' is of type 'unknown'" de tsc, reemplaza en ESA línea
// `X.message` por `errorMessage(X)` y agrega el import de shared/utils/error-message.util si falta.
// Solo toca accesos a `.message`; cualquier otro uso de la variable queda para revisión manual.
// Uso: node fix-unknown-catch.js [prefijo-de-ruta]   (p. ej. shared/utils)
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const prefix = (process.argv[2] || '').replace(/\\/g, '/');
let out = '';
try {
  out = execSync('npx tsc -p tsconfig.json --noEmit', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  out = e.stdout || '';
}

const byFile = new Map();
for (const m of out.matchAll(/^(.+?\.ts)\((\d+),(\d+)\): error TS18046: '([\w$]+)' is of type 'unknown'\./gm)) {
  const [, file, line, , name] = m;
  if (prefix && !file.replace(/\\/g, '/').startsWith(prefix)) continue;
  if (!byFile.has(file)) byFile.set(file, []);
  byFile.get(file).push({ line: Number(line), name });
}

const ROOT = process.cwd();
for (const [file, hits] of byFile) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  // Si el archivo tiene un parámetro/propiedad desestructurada `errorMessage`, el nombre suelto quedaría
  // tapado (sombra) dentro de esa función: se usa la forma calificada errorMessageModule.errorMessage(x).
  const shadowed = /[{,]\s*errorMessage\s*(?:=|,|\})/.test(raw.replace(/const \{ errorMessage[^}]*\} = errorMessageModule;/, ''));
  const callee = shadowed ? 'errorMessageModule.errorMessage' : 'errorMessage';
  let changed = 0;
  for (const { line, name } of hits) {
    const i = line - 1;
    const re = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}\\.message\\b`, 'g');
    if (re.test(lines[i])) {
      lines[i] = lines[i].replace(re, `${callee}(${name})`);
      changed++;
    }
  }
  let s = lines.join('\n');
  if (changed && !/errorMessageModule = require\(/.test(s)) {
    let rel = path.relative(path.dirname(path.join(ROOT, file)), path.join(ROOT, 'shared/utils/error-message.util')).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = './' + rel;
    const importBlock = shadowed
      ? `import errorMessageModule = require('${rel}');\n`
      : `import errorMessageModule = require('${rel}');\n\nconst { errorMessage } = errorMessageModule;\n`;
    // después del último import/require de nivel superior
    const all = [...s.matchAll(/^(?:import .*;|const .* = [\w$]+Module(?:\.[\w$]+)?;)$/gm)];
    const last = all.length ? all[all.length - 1] : null;
    if (last) {
      const at = last.index + last[0].length;
      s = s.slice(0, at) + '\n' + importBlock + s.slice(at);
    } else {
      s = importBlock + '\n' + s;
    }
  }
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
  console.log(`${file}: ${changed}/${hits.length} corregidos`);
}
