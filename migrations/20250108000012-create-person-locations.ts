// migrations/20250108000012-create-person-locations.ts

import type { Migration } from '../shared/types/migration';
import constantsModule = require('../shared/constants');
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'person_locations', schema: SCHEMA },
      {
        person_location_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4
        },
        person_id: {
          type: Sequelize.UUID,
          allowNull: false,
          unique: true,
          references: {
            model: { tableName: 'persons', schema: SCHEMA },
            key: 'person_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        country_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: { tableName: 'countries', schema: SCHEMA },
            key: 'country_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        department_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: { tableName: 'departments', schema: SCHEMA },
            key: 'department_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        city_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: { tableName: 'cities', schema: SCHEMA },
            key: 'city_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        address: {
          type: Sequelize.STRING(100),
          allowNull: false
        },
        postal_code: {
          type: Sequelize.STRING(40),
          allowNull: true
        },
        type: {
          type: Sequelize.STRING(40),
          allowNull: true
        },

        // ── Trazabilidad de sesión. Mixto: null cuando la fila nace en el registro público o en el
        //    prefill (pre-sesión), con valor cuando la crea un admin o el propio cliente ya autenticado ──
        origin_session_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: 'session_id de auth que registró la ubicación'
        },
        origin_correlation_id: {
          type: Sequelize.STRING(128),
          allowNull: true,
          comment: 'correlationId del request que registró la ubicación'
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

    await queryInterface.addIndex({ tableName: 'person_locations', schema: SCHEMA }, ['country_id']);
    await queryInterface.addIndex({ tableName: 'person_locations', schema: SCHEMA }, ['department_id']);
    await queryInterface.addIndex({ tableName: 'person_locations', schema: SCHEMA }, ['city_id']);
    await queryInterface.addIndex({ tableName: 'person_locations', schema: SCHEMA }, ['origin_session_id'], {
      name: 'idx_person_locations_origin_session_id'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ tableName: 'person_locations', schema: SCHEMA });
  }
} satisfies Migration;
