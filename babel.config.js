// babel.config.js
// Solo se usa en tests (vía babel-jest) para los archivos .js. En desarrollo corre tsx y en
// producción el build de tsc. Su razón de existir es permitir que Jest cargue dependencias que se
// publican como ESM puro (p. ej. `jose`), transpilándolas a CommonJS al vuelo.
// Los .ts los transpila ts-jest (Babel no soporta `export =`, que usamos durante la migración).
// Fuera del entorno de test es un no-op.
module.exports = api => {
  const isTest = api.env('test');
  return {
    presets: isTest ? [['@babel/preset-env', { targets: { node: 'current' } }]] : []
  };
};
