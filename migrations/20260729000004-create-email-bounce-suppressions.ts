import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'email_bounce_suppressions', schema: SCHEMA },
      {
        email_bounce_suppression_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4
        },
        email_hash: {
          type: Sequelize.STRING(64),
          allowNull: false,
          unique: true
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: { tableName: 'users', schema: SCHEMA },
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        bounce_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        status: {
          type: Sequelize.ENUM('active', 'suppressed'),
          allowNull: false,
          defaultValue: 'active'
        },
        last_error_code: {
          type: Sequelize.STRING(100),
          allowNull: true
        },
        last_bounce_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        suppressed_at: {
          type: Sequelize.DATE,
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

    const table = { tableName: 'email_bounce_suppressions', schema: SCHEMA };
    await queryInterface.addIndex(table, ['status']);
    await queryInterface.addIndex(table, ['last_bounce_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ tableName: 'email_bounce_suppressions', schema: SCHEMA });
  }
} satisfies Migration;
