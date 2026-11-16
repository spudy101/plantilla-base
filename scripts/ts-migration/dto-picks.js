// scripts/ts-migration/dto-picks.js
//
// DTOs "de paso" que desestructuran su entrada: `function XDTO({ a, b }) {` →
// `function XDTO({ a, b }: Fields<'a' | 'b'>) {`, donde Fields es una interfaz del archivo con
// todos los campos posibles (se escribe a mano: es la única fuente de los tipos de esos campos).
//
// Uso: node scripts/ts-migration/dto-picks.js <archivo.dto.ts> <NombreDeLaInterfaz>
const fs = require('node:fs');

const [file, iface] = process.argv.slice(2);
if (!file || !iface) {
  throw new Error('Uso: dto-picks.js <archivo.dto.ts> <NombreDeLaInterfaz>');
}
const raw = fs.readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');
let n = 0;
s = s.replace(/^(function \w+\()\{ ([^}]+) \}\) \{$/gm, (m, head, list) => {
  const keys = list
    .split(',')
    .map(k => k.trim().split(/[\s=:]/)[0])
    .filter(Boolean);
  n++;
  return `${head}{ ${list} }: Pick<${iface}, ${keys.map(k => `'${k}'`).join(' | ')}>) {`;
});
fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log(`${file}: ${n} DTOs`);
