// === RF-OPS-01: Pipeline DevSecOps, Infraestructura Base ===
// Configuración de Sequelize CLI (migraciones y seeders).
//
// seederStorage: 'sequelize' registra cada seeder ejecutado en la tabla SequelizeData
// (equivalente a SequelizeMeta para migraciones), de modo que `db:seed:all` saltea los
// seeders ya corridos. Solo se aplica a los perfiles PostgreSQL (development/production);
// el perfil test usa SQLite en memoria y se reconstruye en cada corrida.
//
// Comandos:
//   npm run db:migrate       → aplica migraciones pendientes (tracking en SequelizeMeta)
//   npm run db:seed          → aplica seeders pendientes    (tracking en SequelizeData)
//   npm run db:seed:undo     → revierte todos los seeders
import type { Dialect, Options } from 'sequelize';
import constantsModule from '../shared/constants';
const { database, server } = constantsModule;


/** Perfil de conexión: opciones de Sequelize + las de sequelize-cli (tracking de seeders/migraciones). */
type DbProfile = Options & {
  seederStorage?: string;
  seederStorageTableName?: string;
  seederStorageTableSchema?: string;
  migrationStorageTableSchema?: string;
};

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
    // [RF-OPS-01] | CA-02 | Control de seeders ejecutados via
    // SequelizeData — equivalente a SequelizeMeta para migraciones.
    // Comandos: db:seed:all (corre pendientes), db:seed:undo:all.
    seederStorage: 'sequelize',
    seederStorageTableName: 'SequelizeData',
    // Tracking (SequelizeMeta/SequelizeData) DENTRO del esquema DB_SCHEMA, no en `public`.
    // Aísla cada esquema: apuntar a otro DB_SCHEMA re-corre migraciones/seeders desde cero
    // y acota db:reset/undo a ese esquema (no toca el tracking ni las tablas de otros esquemas).
    seederStorageTableSchema: database.schema,
    migrationStorageTableSchema: database.schema,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },

  // 🎯 Tests: SQLite en memoria (como Flask)
  test: {
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    },
    pool: {
      max: 1,
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
    // [RF-OPS-01] | CA-02 | Control de seeders ejecutados via
    // SequelizeData — equivalente a SequelizeMeta para migraciones.
    // Comandos: db:seed:all (corre pendientes), db:seed:undo:all.
    seederStorage: 'sequelize',
    seederStorageTableName: 'SequelizeData',
    // Tracking (SequelizeMeta/SequelizeData) DENTRO del esquema DB_SCHEMA, no en `public`.
    // Aísla cada esquema: apuntar a otro DB_SCHEMA re-corre migraciones/seeders desde cero
    // y acota db:reset/undo a ese esquema (no toca el tracking ni las tablas de otros esquemas).
    seederStorageTableSchema: database.schema,
    migrationStorageTableSchema: database.schema,
    pool: {
      max: 10,
      min: 2,
      acquire: 30000,
      idle: 10000
    }
  }
};

export = baseConfig;
