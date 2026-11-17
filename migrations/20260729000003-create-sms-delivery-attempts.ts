import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'sms_delivery_attempts', schema: SCHEMA },
      {
        sms_attempt_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4
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
        phone_hash: {
          type: Sequelize.STRING(64),
          allowNull: false
        },
        provider: {
          type: Sequelize.STRING(30),
          allowNull: false,
          defaultValue: 'aws_sms'
        },
        purpose: {
          type: Sequelize.STRING(30),
          allowNull: false
        },
        status: {
          type: Sequelize.ENUM('pending', 'sent', 'failed'),
          allowNull: false,
          defaultValue: 'pending'
        },
        retry_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        last_error: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        provider_message_id: {
          type: Sequelize.STRING(255),
          allowNull: true
        },
        sent_at: {
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

    const table = { tableName: 'sms_delivery_attempts', schema: SCHEMA };
    await queryInterface.addIndex(table, ['user_id']);
    await queryInterface.addIndex(table, ['status']);
    await queryInterface.addIndex(table, ['phone_hash']);
    await queryInterface.addIndex(table, ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ tableName: 'sms_delivery_attempts', schema: SCHEMA });
  }
} satisfies Migration;
