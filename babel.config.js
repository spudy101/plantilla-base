// babel.config.js
// Solo se usa en tests (vía babel-jest). En producción/desarrollo el código corre
// con Node directamente, sin transpilación. Su única razón de existir es permitir
// que Jest cargue dependencias que se publican como ESM puro (p. ej. `jose`),
// transpilándolas a CommonJS al vuelo. Fuera del entorno de test es un no-op.
module.exports = (api) => {
  const isTest = api.env('test');
  return {
    presets: isTest
      ? [['@babel/preset-env', { targets: { node: 'current' } }]]
      : []
  };
};
