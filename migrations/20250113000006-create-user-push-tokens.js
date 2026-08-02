const { database } = require('../shared/constants');
const { originSessionMigrationColumns } = require('../shared/models/mixins/origin-session.mixin');

const SCHEMA = database.schema;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'user_push_tokens', schema: SCHEMA },
      {
        user_push_token_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: { tableName: 'users', schema: SCHEMA },
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        token: {
          type: Sequelize.TEXT,
          allowNull: false
        },
        platform: {
          type: Sequelize.STRING(20),
          allowNull: false
        },
        device_id: {
          type: Sequelize.STRING(255),
          allowNull: true
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          defaultValue: true
        },
        last_used_at: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW
        },
        // Trazabilidad de sesión: qué sesión del cliente registró este token/dispositivo push.
        ...originSessionMigrationColumns(Sequelize),
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

    await queryInterface.addIndex({ tableName: 'user_push_tokens', schema: SCHEMA }, ['user_id']);
    await queryInterface.addIndex({ tableName: 'user_push_tokens', schema: SCHEMA }, ['user_id', 'is_active']);
    await queryInterface.addIndex({ tableName: 'user_push_tokens', schema: SCHEMA }, ['user_id', 'token'], { unique: true });
    await queryInterface.addIndex({ tableName: 'user_push_tokens', schema: SCHEMA }, ['platform']);
    await queryInterface.addIndex({ tableName: 'user_push_tokens', schema: SCHEMA }, ['is_active']);
    await queryInterface.addIndex({ tableName: 'user_push_tokens', schema: SCHEMA }, ['origin_session_id'], {
      name: 'idx_user_push_tokens_origin_session_id'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ tableName: 'user_push_tokens', schema: SCHEMA });
  }
};
