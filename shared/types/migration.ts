// shared/types/migration.ts
//
// Contrato de las migraciones y seeders que corre sequelize-cli (umzug): cada archivo exporta por
// defecto `{ up, down }` y umzug llama a cada método con `(queryInterface, Sequelize)`, donde el
// segundo argumento es el módulo `sequelize` completo (DataTypes, QueryTypes, Op…).
//
//   export default {
//     async up(queryInterface, Sequelize) { … },
//     async down(queryInterface) { … }
//   } satisfies Migration;
import type { QueryInterface } from 'sequelize';
import type * as SequelizeModule from 'sequelize';

/** Lo que sequelize-cli pasa como segundo argumento: `require('sequelize')`. */
export type SequelizeStatic = typeof SequelizeModule;

export interface Migration {
  up(queryInterface: QueryInterface, Sequelize: SequelizeStatic): Promise<void>;
  down(queryInterface: QueryInterface, Sequelize: SequelizeStatic): Promise<void>;
}
