// migrations/20250108000005-create-genders.ts

import type { Migration } from '../shared/types/migration';
import constantsModule = require('../shared/constants');
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'genders', schema: SCHEMA },
      {
        gender_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4
        },
        name: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true
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

    await queryInterface.addIndex({ tableName: 'genders', schema: SCHEMA }, ['is_active']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ tableName: 'genders', schema: SCHEMA });
  }
} satisfies Migration;
