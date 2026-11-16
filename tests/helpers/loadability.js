// tests/helpers/loadability.js
//
// Helper compartido para los load-tests de cargabilidad (Tier 1). Centraliza el
// recorrido del árbol de archivos y las exclusiones para que cada test de área
// (shared/, modules/admin, modules/client, modules/schemas, modules/shared-endpoints)
// solo declare QUÉ subárbol cubre, sin duplicar la mecánica.
//
// Cada archivo de área llama a `describeLoadability(baseDir)` y obtiene un bloque
// que verifica que TODOS los .js de ese subárbol se puedan `require()` sin lanzar.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// Archivos de arranque / con efectos secundarios al importar (levantan servidor,
// abren puertos, etc.). No forman parte de la superficie que estos tests cubren.
const EXCLUDES = [
  /[\\/]servers[\\/]/,
  /[\\/]node_modules[\\/]/,
  /[\\/]app\.js$/, // modules/{admin,client}/app.js: montan la app Express
  /\.server\.js$/,
  /\.app\.js$/
];

/**
 * Recorre recursivamente `dir` y devuelve las rutas absolutas de los .js / .ts no excluidos
 * (migración gradual a TypeScript: ambos deben seguir siendo cargables).
 * @param {string} dir Ruta absoluta del directorio a recorrer.
 * @returns {string[]} Rutas absolutas de los archivos .js / .ts cargables.
 */
function collectJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsFiles(full));
    } else if (entry.isFile() && /\.(js|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      if (!EXCLUDES.some((re) => re.test(full))) {out.push(full);}
    }
  }
  return out;
}

/**
 * Declara el bloque `describe` de cargabilidad para un subárbol relativo a la raíz.
 * @param {string} baseDir Ruta relativa a la raíz del repo (p. ej. 'modules/admin').
 */
function describeLoadability(baseDir) {
  describe(`cargabilidad · ${baseDir}/`, () => {
    const files = collectJsFiles(path.join(ROOT, baseDir));

    it(`encuentra archivos .js en ${baseDir}/`, () => {
      expect(files.length).toBeGreaterThan(0);
    });

    it.each(files.map((f) => [path.relative(ROOT, f).replace(/\\/g, '/'), f]))(
      'carga %s',
      (_rel, full) => {
        expect(() => require(full)).not.toThrow();
      }
    );
  });
}

module.exports = { ROOT, EXCLUDES, collectJsFiles, describeLoadability };
