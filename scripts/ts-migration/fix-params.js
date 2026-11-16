// Fixer: anota parámetros "implicitly any" (TS7006) cuyo nombre tiene un tipo inequívoco en el proyecto.
// Inserta `: Tipo` justo después del nombre, en la línea/columna que reporta tsc.
//   - Si el default es `= null` → `Tipo | null`.
//   - req/res/next → tipos de express (agrega `import type { … } from 'express'` si falta).
// Los nombres fuera del diccionario NO se tocan (quedan para revisión manual).
// Uso: node fix-params.js [prefijo-de-ruta]
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const STRING = [
  'userId', 'adminUserId', 'targetUserId', 'personId', 'sessionId', 'currentSessionId', 'jti', 'oldJti', 'newJti',
  'fingerprintHash', 'deviceId', 'accessToken', 'refreshToken', 'nationalId', 'email', 'phone', 'ip', 'ipAddress',
  'userAgent', 'key', 'cacheKey', 'pattern', 'prefix', 'label', 'roleName', 'moduleName', 'url', 'filename',
  'fileName', 'contentType', 'mimeType', 'bucket', 'folder', 'correlationId', 'requestId', 'entityTable',
  'entityType', 'entityId', 'tableName', 'channel', 'secret', 'plainText', 'encryptedText', 'hash', 'salt',
  'iv', 'region', 'operation', 'provider', 'product', 'serviceName', 'breakerName', 'name', 'reason', 'source',
  'traceId', 'origin', 'host', 'eventName', 'accountName', 'phoneNumber', 'tipoNotificacion', 'locale',
  'code', 'token', 'emailHash', 'contactValue', 'version', 'notificationCategoryCode', 'username', 'searchTerm',
  'rawPrefix', 'haystack', 'cityName', 'deviceName', 'password', 'plainPassword', 'newPassword',
  'hashedPassword', 'operationKey', 'platform', 'acknowledgedBy', 'passwordHash', 'currentPassword', 'newUsername',
  'birthDate', 'title', 'body', 'asunto', 'cuerpoHtml', 'destinatario', 'notificationTypeCode', 'endpointArn',
  'emailOrHash', 'template', 'variable', 'match', 'chars', 'opKey', 'mensaje', 'message', 'subject', 'html',
  'firstName', 'lastName', 'currentFingerprintHash', 'totpCode', 'refreshTokenStr', 'categoryCode', 'sortBy',
  'clientType', 'serverContext'
];
const STRING_ARRAY = ['roleNames', 'names'];
// req.query y similares: claves arbitrarias, se normalizan con PaginationHelper
const RECORD = ['query'];
const NUMBER = [
  'tokenExp', 'tokenIat', 'beforeIat', 'rotationTs', 'ttl', 'ttlSeconds', 'seconds', 'limit', 'offset', 'page',
  'ms', 'delayMs', 'timeoutMs', 'expiresIn', 'maxRetries', 'statusCode',
  'durationMs', 'startTime', 'count', 'size', 'bytes', 'retryAfter', 'windowMs', 'max', 'threshold',
  'retentionDays', 'newSignCount'
];
const UNKNOWN = ['value', 'payload', 'meta', 'metadata', 'obj', 'input', 'result', 'details', 'extra'];
// Tipos que requieren import: nombre → [módulo, tipo]
const IMPORTED = {
  req: ['express', 'Request'],
  res: ['express', 'Response'],
  next: ['express', 'NextFunction'],
  transaction: ['sequelize', 'Transaction'],
  // Rutas del proyecto (desde la raíz): el import se escribe relativo al archivo
  auditContext: ['shared/types/audit-context', 'RequestAuditContext']
};

const TYPES = new Map([
  ...STRING.map(n => [n, 'string']),
  ...NUMBER.map(n => [n, 'number']),
  ...STRING_ARRAY.map(n => [n, 'string[]']),
  ...RECORD.map(n => [n, 'Record<string, unknown>']),
  ...UNKNOWN.map(n => [n, 'unknown']),
  ...Object.entries(IMPORTED).map(([n, [, t]]) => [n, t])
]);

// Sufijos: en este proyecto toda PK/FK es UUID → `fooId: string`, `fooIds: string[]`.
const typeOf = name =>
  TYPES.get(name) ?? (/[a-z]Id$/.test(name) ? 'string' : /[a-z]Ids$/.test(name) ? 'string[]' : undefined);

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
  if (!typeOf(name)) continue;
  if (!byFile.has(file)) byFile.set(file, []);
  byFile.get(file).push({ line: Number(line), col: Number(col), name });
}

for (const [file, hits] of byFile) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  // De derecha a izquierda para que las columnas sigan siendo válidas en la misma línea
  hits.sort((a, b) => b.line - a.line || b.col - a.col);
  const usedImports = new Map(); // módulo → Set de tipos
  let changed = 0;
  for (const { line, col, name } of hits) {
    const i = line - 1;
    const start = col - 1;
    const text = lines[i];
    if (text.slice(start, start + name.length) !== name) continue;
    const after = text.slice(start + name.length);
    if (/^\s*:/.test(after)) continue; // ya anotado
    let type = typeOf(name);
    if (/^\s*=\s*null\b/.test(after) && type !== 'unknown') type = `${type} | null`;
    if (IMPORTED[name]) {
      const [mod, t] = IMPORTED[name];
      if (!usedImports.has(mod)) usedImports.set(mod, new Set());
      usedImports.get(mod).add(t);
    }
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
  for (const [rawMod, types] of usedImports) {
    const mod = rawMod.startsWith('shared/')
      ? (r => (r.startsWith('.') ? r : `./${r}`))(path.relative(path.dirname(path.resolve(file)), path.resolve(rawMod)).split(path.sep).join('/'))
      : rawMod;
    const re = new RegExp(`^import type \\{([^}]*)\\} from '${mod}';$`, 'm');
    const m = s.match(re);
    if (m) {
      const names = new Set(m[1].split(',').map(x => x.trim()).filter(Boolean));
      types.forEach(n => names.add(n));
      s = s.replace(m[0], `import type { ${[...names].sort().join(', ')} } from '${mod}';`);
    } else {
      const imp = `import type { ${[...types].sort().join(', ')} } from '${mod}';\n`;
      const first = s.match(/^import .*$/m);
      s = first ? s.slice(0, first.index) + imp + s.slice(first.index) : imp + s;
    }
  }
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
  console.log(`${file}: ${changed} parámetros anotados`);
}
