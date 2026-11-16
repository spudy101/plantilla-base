// Helper de edición: pares [buscar, reemplazar] exactos; respeta CRLF; falla si un texto no aparece.
// Uso desde un script: const edit = require('<scratchpad>/edit.js'); edit('ruta', [[a, b], ...]);
const fs = require('node:fs');

module.exports = function edit(file, pairs, { all = false } = {}) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) {
      throw new Error(`${file}: no se encontró:\n${a.slice(0, 200)}`);
    }
    s = all ? s.split(a).join(b) : s.replace(a, () => b);
  }
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
};
