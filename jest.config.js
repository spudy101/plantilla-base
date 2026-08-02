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

  testMatch: ['**/tests/unit/**/*.test.js', '**/tests/integration/**/*.test.js'],

  collectCoverageFrom: [
    // Capas de aplicación
    'modules/**/*.service.js',
    'modules/**/*.controller.js',
    'modules/**/*.dto.js',
    'modules/**/*.validator.js',

    // Utils / workers / helpers de módulo
    'modules/**/utils/*.util.js',
    'modules/**/workers/*.worker.js',
    'modules/**/helpers/*.helper.js',

    // Shared utils, middlewares, validators, services
    'shared/utils/*.util.js',
    'shared/middlewares/*.middleware.js',
    'shared/validators/*.validator.js',
    'shared/services/*.service.js',
    'shared/repositories/base.repository.js',

    // Shared DTOs (componentes con lógica de mapeo/transformación)
    'shared/dtos/**/*.js',

    // Repositorios (capa de acceso a datos)
    'modules/**/*.repository.js',

    // Exclusiones: archivos de arranque / bootstrap
    '!modules/admin/app.js',
    '!modules/client/app.js',
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
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      maxWorkers: 3
    },
    {
      ...sharedConfig,
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      maxWorkers: 1
    }
  ],

  // Termina Jest sin esperar a que handles abiertos cierren (setInterval del HybridStore)
  forceExit: true
};
