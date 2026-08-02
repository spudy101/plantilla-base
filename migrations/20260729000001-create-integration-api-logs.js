const { database } = require('../shared/constants');

const SCHEMA = database.schema;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'integration_api_logs', schema: SCHEMA },
      {
        api_log_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4
        },
        product: {
          type: Sequelize.ENUM('ses', 's3', 'sns', 'aws_sms'),
          allowNull: false
        },
        endpoint: {
          type: Sequelize.STRING(500),
          allowNull: false
        },
        // Anclaje a la sesión del usuario que originó la llamada (append-only: sin FK dura para no
        // borrar la bitácora al purgar sesiones/usuarios).
        user_id: {
          type: Sequelize.UUID,
          allowNull: true
        },
        session_id: {
          type: Sequelize.UUID,
          allowNull: true
        },
        result: {
          type: Sequelize.ENUM('success', 'failed', 'circuit_open'),
          allowNull: false
        },
        response_time_ms: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        error_code: {
          type: Sequelize.STRING(50),
          allowNull: true
        },
        error_message: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        request_payload: {
          type: Sequelize.JSONB,
          allowNull: true
        },
        response_payload: {
          type: Sequelize.JSONB,
          allowNull: true
        },
        is_system_error: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        notification_id: {
          type: Sequelize.UUID,
          allowNull: true
        },
        created_at: {
          allowNull: false,
          type: Sequelize.DATE
        }
      }
    );

    const table = { tableName: 'integration_api_logs', schema: SCHEMA };
    await queryInterface.addIndex(table, ['product']);
    await queryInterface.addIndex(table, ['result']);
    await queryInterface.addIndex(table, ['user_id']);
    await queryInterface.addIndex(table, ['session_id']);
    await queryInterface.addIndex(table, ['notification_id']);
    await queryInterface.addIndex(table, ['created_at']);
    await queryInterface.addIndex(table, ['product', 'result', 'created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ tableName: 'integration_api_logs', schema: SCHEMA });
  }
};
