// Configuración de la conexión de Sequelize en runtime (config/config.ts). Convive con Prisma hasta la
// fase 7 de docs/prisma-migration.md. Migraciones y seed ya no pasan por acá: prisma/migrations y
// prisma/seed.ts (`npm run db:migrate`, `npm run db:seed`). Los tres perfiles son PostgreSQL: el de test
// apunta al esquema aislado que fija tests/test-env.ts (TEST_DB_SCHEMA, por defecto `test`).
import type { Dialect, Options } from 'sequelize';
import constantsModule from '../shared/constants';
const { database, server } = constantsModule;

/** Perfil de conexión de Sequelize. */
type DbProfile = Options;

// dialect viene del entorno (DB_DIALECT): se confía en el valor configurado
const dialect = database.dialect as Dialect;

const baseConfig: Record<'development' | 'test' | 'production', DbProfile> = {
  development: {
    username: database.user,
    password: database.password,
    database: database.name,
    host: database.host,
    port: database.port,
    dialect,
    dialectOptions: {
      prependSearchPath: true,
      // SSL solo en desarrollo remoto (App Runner), no en localhost
      // [RF-OPS-01] | CA-05 | TLS verificado contra bundle CA de AWS
      // RDS cuando RDS_CA_BUNDLE_PATH está definido (prod/uat/dev/qa).
      // En localhost SSL no aplica (condición LOCALHOST=true).
      ...(server.localhost !== 'true' && {
        ssl: {
          require: true,
          // [RF-OPS-01][CA-05]: si hay bundle CA valida el certificado
          // del servidor. En localhost no aplica (condición padre).
          ...(database.rdsCaBundlePath
            ? {
                rejectUnauthorized: true,
                ca: require('node:fs').readFileSync(database.rdsCaBundlePath, 'utf8')
              }
            : { rejectUnauthorized: false })
        }
      })
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    },
    // database.logging ya es boolean (parseBoolEnv): antes se comparaba contra 'true' y DB_LOGGING=true
    // nunca activaba el log de SQL
    logging: database.logging ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },

  // Tests: Postgres local o el service container de CI, sin TLS, en un esquema propio (tests/test-env.ts).
  // No hay perfil SQLite: Prisma fija el proveedor en el schema y los tests usan la misma base que la app.
  test: {
    username: database.user,
    password: database.password,
    database: database.name,
    host: database.host,
    port: database.port,
    dialect,
    dialectOptions: { prependSearchPath: true },
    logging: false,
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    },
    pool: {
      max: 2,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },

  production: {
    username: database.user,
    password: database.password,
    database: database.name,
    host: database.host,
    port: database.port,
    dialect,
    dialectOptions: {
      prependSearchPath: true,
      // SSL solo en desarrollo remoto (App Runner), no en localhost
      // [RF-OPS-01] | CA-05 | TLS verificado contra bundle CA de AWS
      // RDS cuando RDS_CA_BUNDLE_PATH está definido (prod/uat/dev/qa).
      // En localhost SSL no aplica (condición LOCALHOST=true).
      ...(server.localhost !== 'true' && {
        ssl: {
          require: true,
          // [RF-OPS-01][CA-05]: si hay bundle CA valida el certificado
          // del servidor. En localhost no aplica (condición padre).
          ...(database.rdsCaBundlePath
            ? {
                rejectUnauthorized: true,
                ca: require('node:fs').readFileSync(database.rdsCaBundlePath, 'utf8')
              }
            : { rejectUnauthorized: false })
        }
      })
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    },
    logging: false,
    pool: {
      max: 10,
      min: 2,
      acquire: 30000,
      idle: 10000
    }
  }
};

export = baseConfig;
