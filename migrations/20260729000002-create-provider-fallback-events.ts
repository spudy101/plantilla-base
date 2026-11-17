import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'provider_fallback_events', schema: SCHEMA },
      {
        fallback_event_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4
        },
        provider: {
          type: Sequelize.STRING(50),
          allowNull: false
        },
        circuit_product: {
          type: Sequelize.STRING(50),
          allowNull: false
        },
        started_at: {
          type: Sequelize.DATE,
          allowNull: false
        },
        ended_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        affected_processes_count: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        metadata: {
          type: Sequelize.JSONB,
          allowNull: true
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

    const table = { tableName: 'provider_fallback_events', schema: SCHEMA };
    await queryInterface.addIndex(table, ['provider']);
    await queryInterface.addIndex(table, ['circuit_product']);
    await queryInterface.addIndex(table, ['ended_at']);
    await queryInterface.addIndex(table, ['provider', 'ended_at']);
    await queryInterface.addIndex(table, ['started_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ tableName: 'provider_fallback_events', schema: SCHEMA });
  }
} satisfies Migration;
