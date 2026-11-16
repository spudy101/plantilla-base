// Fixer: anota parámetros "implicitly any" (TS7006) cuyo nombre tiene un tipo inequívoco en el proyecto.
// Inserta `: Tipo` justo después del nombre, en la línea/columna que reporta tsc.
//   - Si el default es `= null` → `Tipo | null`.
//   - req/res/next → tipos de express (agrega `import type { … } from 'express'` si falta).
// Los nombres fuera del diccionario NO se tocan (quedan para revisión manual).
// Uso: node fix-params.js [prefijo-de-ruta]
const fs = require('node:fs');
const { execSync } = require('node:child_process');

const STRING = [
  'userId', 'adminUserId', 'targetUserId', 'personId', 'sessionId', 'currentSessionId', 'jti', 'oldJti', 'newJti',
  'fingerprintHash', 'deviceId', 'accessToken', 'refreshToken', 'nationalId', 'email', 'phone', 'ip', 'ipAddress',
  'userAgent', 'key', 'cacheKey', 'pattern', 'prefix', 'label', 'roleName', 'moduleName', 'url', 'filename',
  'fileName', 'contentType', 'mimeType', 'bucket', 'folder', 'correlationId', 'requestId', 'entityTable',
  'entityType', 'entityId', 'tableName', 'channel', 'secret', 'plainText', 'encryptedText', 'hash', 'salt',
  'iv', 'region', 'operation', 'provider', 'product', 'serviceName', 'breakerName', 'name', 'reason', 'source',
  'traceId', 'origin', 'host', 'eventName', 'accountName', 'phoneNumber', 'tipoNotificacion', 'locale'
];
const NUMBER = [
  'tokenExp', 'tokenIat', 'beforeIat', 'rotationTs', 'ttl', 'ttlSeconds', 'seconds', 'limit', 'offset', 'page',
  'ms', 'delayMs', 'timeoutMs', 'expiresIn', 'maxRetries', 'statusCode',
  'durationMs', 'startTime', 'count', 'size', 'bytes', 'retryAfter', 'windowMs', 'max', 'threshold'
];
const UNKNOWN = ['value', 'payload', 'meta', 'metadata', 'obj', 'input', 'result', 'details', 'extra'];
const EXPRESS = { req: 'Request', res: 'Response', next: 'NextFunction' };

const TYPES = new Map([
  ...STRING.map(n => [n, 'string']),
  ...NUMBER.map(n => [n, 'number']),
  ...UNKNOWN.map(n => [n, 'unknown']),
  ...Object.entries(EXPRESS)
]);

const prefix = (process.argv[2] || '').replace(/\\/g, '/');
let out = '';
try {
  out = execSync('npx tsc -p tsconfig.json --noEmit', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  out = e.stdout || '';
}

const byFile = new Map();
for (const m of out.matchAll(/^(.+?\.ts)\((\d+),(\d+)\): error TS7006: Parameter '([\w$]+)' implicitly has an 'any' type\./gm)) {
  const [, file, line, col, name] = m;
  if (prefix && !file.replace(/\\/g, '/').startsWith(prefix)) continue;
  if (!TYPES.has(name)) continue;
  if (!byFile.has(file)) byFile.set(file, []);
  byFile.get(file).push({ line: Number(line), col: Number(col), name });
}

for (const [file, hits] of byFile) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  // De derecha a izquierda para que las columnas sigan siendo válidas en la misma línea
  hits.sort((a, b) => b.line - a.line || b.col - a.col);
  let usedExpress = new Set();
  let changed = 0;
  for (const { line, col, name } of hits) {
    const i = line - 1;
    const start = col - 1;
    const text = lines[i];
    if (text.slice(start, start + name.length) !== name) continue;
    const after = text.slice(start + name.length);
    if (/^\s*:/.test(after)) continue; // ya anotado
    let type = TYPES.get(name);
    if (/^\s*=\s*null\b/.test(after) && type !== 'unknown') type = `${type} | null`;
    if (EXPRESS[name]) usedExpress.add(EXPRESS[name]);
    // Parámetro de arrow sin paréntesis: `x => …` → `(x: T) => …`
    const before = text.slice(0, start);
    // Si inmediatamente después del nombre viene `=>`, es un parámetro sin paréntesis (`x => …`).
    const bare = /^\s*=>/.test(after);
    lines[i] = bare
      ? `${before}(${name}: ${type})${after}`
      : `${before}${name}: ${type}${after}`;
    changed++;
  }
  let s = lines.join('\n');
  if (usedExpress.size) {
    const m = s.match(/^import type \{([^}]*)\} from 'express';$/m);
    if (m) {
      const names = new Set(m[1].split(',').map(x => x.trim()).filter(Boolean));
      usedExpress.forEach(n => names.add(n));
      s = s.replace(m[0], `import type { ${[...names].sort().join(', ')} } from 'express';`);
    } else {
      const imp = `import type { ${[...usedExpress].sort().join(', ')} } from 'express';\n`;
      const first = s.match(/^import .*$/m);
      s = first ? s.slice(0, first.index) + imp + s.slice(first.index) : imp + s;
    }
  }
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
  console.log(`${file}: ${changed} parámetros anotados`);
}
