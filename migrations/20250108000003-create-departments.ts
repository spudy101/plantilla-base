// migrations/20250108000003-create-departments.ts

import type { Migration } from '../shared/types/migration';
import constantsModule = require('../shared/constants');
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'departments', schema: SCHEMA },
      {
        department_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4
        },
        name: {
          type: Sequelize.STRING(100),
          allowNull: false
        },
        dane_code: {
          type: Sequelize.STRING(2),
          allowNull: true,
          comment: 'Código DANE numérico del departamento (2 dígitos). Requerido para reportes DIAN.'
        },
        country_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: { tableName: 'countries', schema: SCHEMA },
            key: 'country_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          defaultValue: true
        },
        created_at: {
          allowNull: false,
          type: Sequelize.DATE
        },
        updated_at: {
          allowNull: false,
          type: Sequelize.DATE
        }
      }
    );

    await queryInterface.addIndex({ tableName: 'departments', schema: SCHEMA }, ['country_id']);
    await queryInterface.addIndex({ tableName: 'departments', schema: SCHEMA }, ['name']);
    await queryInterface.addIndex({ tableName: 'departments', schema: SCHEMA }, ['is_active']);
    // Índice compuesto para búsquedas por país
    await queryInterface.addIndex({ tableName: 'departments', schema: SCHEMA }, ['country_id', 'name']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ tableName: 'departments', schema: SCHEMA });
  }
} satisfies Migration;
