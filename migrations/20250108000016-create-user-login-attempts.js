// migrations/20250108000016-create-user-login-attempts.js

const { database } = require('../shared/constants');

const SCHEMA = database.schema;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'user_login_attempts', schema: SCHEMA },
      {
        user_login_attempt_id: {
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
          onDelete: 'CASCADE',
          comment: 'Null if user not found'
        },
        username_attempt: {
          type: Sequelize.STRING(255),
          allowNull: false,
          comment: 'Username de cognito'
        },
        national_id: {
          type: Sequelize.STRING(255),
          allowNull: false,
          comment: 'Cifrado AES-256-GCM'
        },
        national_id_hash: {
          type: Sequelize.STRING(64),
          allowNull: true,
          comment: 'HMAC-SHA256(national_id, HASH_PEPPER) — solo para búsquedas WHERE'
        },
        ip_address: {
          type: Sequelize.STRING(45),
          allowNull: true,
          comment: 'IPv4 or IPv6'
        },
        user_agent: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        device_fingerprint: {
          type: Sequelize.STRING(255),
          allowNull: true
        },
        success: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        failure_reason: {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: 'Invalid credentials, account locked, etc.'
        },
        blocked_until: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'When the account/IP will be unblocked'
        },
        attempted_at: {
          allowNull: false,
          type: Sequelize.DATE
        },

        // ── Trazabilidad de sesión. Null en los intentos FALLIDOS (la sesión nunca llegó a existir) y con
        //    valor en los exitosos, donde el sessionId se pasa explícito ──
        origin_session_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: 'session_id de auth que originó el intento de login'
        },
        origin_correlation_id: {
          type: Sequelize.STRING(128),
          allowNull: true,
          comment: 'correlationId del request que originó el intento de login'
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

    await queryInterface.addIndex({ tableName: 'user_login_attempts', schema: SCHEMA }, ['user_id']);
    await queryInterface.addIndex({ tableName: 'user_login_attempts', schema: SCHEMA }, ['national_id_hash'], {
      name: 'idx_user_login_attempts_national_id_hash'
    });
    await queryInterface.addIndex({ tableName: 'user_login_attempts', schema: SCHEMA }, ['username_attempt']);
    await queryInterface.addIndex({ tableName: 'user_login_attempts', schema: SCHEMA }, ['ip_address']);
    await queryInterface.addIndex({ tableName: 'user_login_attempts', schema: SCHEMA }, ['success']);
    await queryInterface.addIndex({ tableName: 'user_login_attempts', schema: SCHEMA }, ['attempted_at']);
    await queryInterface.addIndex({ tableName: 'user_login_attempts', schema: SCHEMA }, ['blocked_until']);
    // Índice compuesto para detectar intentos fallidos recientes
    await queryInterface.addIndex({ tableName: 'user_login_attempts', schema: SCHEMA }, ['user_id', 'attempted_at', 'success']);
    // Índice compuesto para análisis por IP
    await queryInterface.addIndex({ tableName: 'user_login_attempts', schema: SCHEMA }, ['ip_address', 'attempted_at']);
    await queryInterface.addIndex({ tableName: 'user_login_attempts', schema: SCHEMA }, ['origin_session_id'], {
      name: 'idx_user_login_attempts_origin_session_id'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ tableName: 'user_login_attempts', schema: SCHEMA });
  }
};
