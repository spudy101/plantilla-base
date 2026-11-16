// scripts/ts-migration/req-user.js
//
// `req.user` es opcional en el tipo de Express: en controllers detrás de AuthMiddleware,
//   req.user.userId  →  requireAuthUser(req).userId
// (devuelve el usuario tipado o lanza 401; antes una ruta mal configurada daba TypeError → 500).
// Agrega el import de shared/utils/auth-user.util. No toca `req.user?.x` (acceso opcional a propósito).
//
// También: req.params.x → routeParam(req, 'x') (shared/utils/route-param.util).
//
// Uso: node scripts/ts-migration/req-user.js <archivos.ts…>
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

// Segunda pasada: dentro de cada handler `= asyncHandler(async (req, res) => { … })` con 2+ usos,
// un solo `const user = requireAuthUser(req);` (o requireAuthPerson si el handler lee personId).
function hoistUser(s) {
  const HEAD = /^( {2}\w+ = asyncHandler\(async \(req(?:: \w+)?, res(?:: \w+)?(?:, next(?:: \w+)?)?\) => \{\n)/gm;
  let out = '';
  let last = 0;
  let usedPerson = false;
  for (const m of s.matchAll(HEAD)) {
    const bodyStart = m.index + m[0].length;
    const end = s.indexOf('\n  });', bodyStart);
    if (end < 0) {
      continue;
    }
    let body = s.slice(bodyStart, end);
    const uses = (body.match(/requireAuthUser\(req\)\./g) || []).length;
    if (uses >= 2 && !/\bconst user\b/.test(body)) {
      const needsPerson = /requireAuthUser\(req\)\.personId\b/.test(body);
      usedPerson ||= needsPerson;
      body = `    const user = ${needsPerson ? 'requireAuthPerson' : 'requireAuthUser'}(req);\n` + body.replace(/requireAuthUser\(req\)\./g, 'user.');
    }
    out += s.slice(last, bodyStart) + body;
    last = end;
  }
  return { s: out + s.slice(last), usedPerson };
}

// req.params.x → routeParam(req, 'x') (string garantizado o 400). Devuelve el texto y si cambió.
function routeParams(s, file) {
  if (!/\breq\.params\.\w+/.test(s)) {
    return s;
  }
  s = s.replace(/\breq\.params\.(\w+)/g, "routeParam(req, '$1')");
  if (!/= routeParamUtilModule;/.test(s)) {
    const rel = path.relative(path.dirname(file), path.join(ROOT, 'shared/utils/route-param.util')).split(path.sep).join('/');
    const imp = `import routeParamUtilModule = require('${rel}');\nconst { routeParam } = routeParamUtilModule;`;
    const last = [...s.matchAll(/^(?:import .*;|const .* = [\w$]+Module(?:\.[\w$]+)?;)$/gm)].pop();
    const pos = last ? last.index + last[0].length : 0;
    s = s.slice(0, pos) + '\n' + imp + s.slice(pos);
  }
  return s;
}

for (const arg of process.argv.slice(2)) {
  const file = path.resolve(arg);
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = routeParams(raw.replace(/\r\n/g, '\n'), file);
  if (s !== raw.replace(/\r\n/g, '\n') && !/\breq\.user\.(?=\w)/.test(s)) {
    fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
    console.log(`${arg}: req.params`);
    continue;
  }
  const n = (s.match(/\breq\.user\.(?=\w)/g) || []).length;
  if (!n) {
    continue;
  }
  s = s.replace(/\breq\.user\.(?=\w)/g, 'requireAuthUser(req).');
  const hoisted = hoistUser(s);
  s = hoisted.s;
  // requireAuthUser puede haber quedado sin usos directos tras el hoist
  const names = [/\brequireAuthUser\(req\)/.test(s) && 'requireAuthUser', hoisted.usedPerson && 'requireAuthPerson'].filter(Boolean);
  if (names.length && !/= authUserUtilModule;/.test(s)) {
    const rel = path.relative(path.dirname(file), path.join(ROOT, 'shared/utils/auth-user.util')).split(path.sep).join('/');
    const imp = `import authUserUtilModule = require('${rel}');\nconst { ${names.join(', ')} } = authUserUtilModule;`;
    const last = [...s.matchAll(/^(?:import .*;|const .* = [\w$]+Module(?:\.[\w$]+)?;)$/gm)].pop();
    const pos = last ? last.index + last[0].length : 0;
    s = s.slice(0, pos) + '\n' + imp + s.slice(pos);
  }
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
  console.log(`${arg}: ${n}`);
}
