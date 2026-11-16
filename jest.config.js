/** @type {import('jest').Config} */

const sharedConfig = {
  testEnvironment: 'node',
  workerIdleMemoryLimit: '512MB',
  setupFiles: ['<rootDir>/tests/jest.setup.env.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  // `jose` (usado por jwt.util) se publica como ESM puro; Node lo carga con
  // require(ESM), pero el loader de Jest no. Lo transpilamos vía babel-jest
  // (todo lo demás en node_modules se sigue ignorando por rendimiento).
  transformIgnorePatterns: ['/node_modules/(?!(jose)/)'],
  // .ts → ts-jest (solo transpila; los tipos los revisa `npm run typecheck`).
  // .js → babel-jest. Babel no soporta `export =`, que usan los .ts durante la migración.
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true, tsconfig: '<rootDir>/tsconfig.test.json' }],
    '^.+\\.js$': 'babel-jest'
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  clearMocks: true,
  resetMocks: false,
  restoreMocks: false,
  moduleNameMapper: {
    '^shared/(.*)$': '<rootDir>/shared/$1',
    '^modules/(.*)$': '<rootDir>/modules/$1',
    '^config/(.*)$': '<rootDir>/config/$1',
    '^tests/helpers$': '<rootDir>/tests/helpers/index.js',
    '^tests/helpers/(.*)$': '<rootDir>/tests/helpers/$1'
  }
};

module.exports = {
  ...sharedConfig,

  testMatch: ['**/tests/unit/**/*.test.{js,ts}', '**/tests/integration/**/*.test.{js,ts}'],

  collectCoverageFrom: [
    // Capas de aplicación
    'modules/**/*.service.{js,ts}',
    'modules/**/*.controller.{js,ts}',
    'modules/**/*.dto.{js,ts}',
    'modules/**/*.validator.{js,ts}',

    // Utils / workers / helpers de módulo
    'modules/**/utils/*.util.{js,ts}',
    'modules/**/workers/*.worker.{js,ts}',
    'modules/**/helpers/*.helper.{js,ts}',

    // Shared utils, middlewares, validators, services
    'shared/utils/*.util.{js,ts}',
    'shared/middlewares/*.middleware.{js,ts}',
    'shared/validators/*.validator.{js,ts}',
    'shared/services/*.service.{js,ts}',
    'shared/repositories/base.repository.{js,ts}',

    // Shared DTOs (componentes con lógica de mapeo/transformación)
    'shared/dtos/**/*.{js,ts}',

    // Repositorios (capa de acceso a datos)
    'modules/**/*.repository.{js,ts}',

    // Exclusiones: archivos de arranque / bootstrap
    '!modules/admin/app.{js,ts}',
    '!modules/client/app.{js,ts}',
    '!servers/**',
    '!**/node_modules/**'
  ],

  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],

  testTimeout: 10000,

  projects: [
    {
      ...sharedConfig,
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.{js,ts}'],
      maxWorkers: 3
    },
    {
      ...sharedConfig,
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.{js,ts}'],
      maxWorkers: 1
    }
  ],

  // Termina Jest sin esperar a que handles abiertos cierren (setInterval del HybridStore)
  forceExit: true
};
