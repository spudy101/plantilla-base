// migrations/20250108000015-create-verification-codes.js

const { database } = require('../shared/constants');

const SCHEMA = database.schema;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'verification_codes', schema: SCHEMA },
      {
        verification_code_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4
        },
        type: {
          // 'contract_signature' → OTP por correo para la firma electrónica de contingencia 2FA
          // del contrato (REQ-09 BUILD 1, Ley 527/1999). Se aísla de los OTP de onboarding email/phone.
          type: Sequelize.ENUM('email', 'phone', 'contract_signature'),
          allowNull: false
        },
        contact_value: {
          type: Sequelize.STRING(255),
          allowNull: false,
          comment: 'Email address or phone number'
        },
        code: {
          type: Sequelize.STRING(10),
          allowNull: false
        },
        attempts: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: false
        },
        verified_at: {
          type: Sequelize.DATE,
          allowNull: true
        },

        // ── Trazabilidad de sesión. Mixto: null en los OTP de onboarding y en el challenge SMS de login
        //    (rutas públicas, pre-sesión); con sesión real al activar MFA y al firmar contrato ──
        origin_session_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: 'session_id de auth que solicitó el código'
        },
        origin_correlation_id: {
          type: Sequelize.STRING(128),
          allowNull: true,
          comment: 'correlationId del request que solicitó el código'
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

    await queryInterface.addIndex({ tableName: 'verification_codes', schema: SCHEMA }, ['contact_value']);
    await queryInterface.addIndex({ tableName: 'verification_codes', schema: SCHEMA }, ['type']);
    await queryInterface.addIndex({ tableName: 'verification_codes', schema: SCHEMA }, ['expires_at']);
    await queryInterface.addIndex({ tableName: 'verification_codes', schema: SCHEMA }, ['verified_at']);
    // Índice compuesto para búsquedas de códigos activos
    await queryInterface.addIndex({ tableName: 'verification_codes', schema: SCHEMA }, ['contact_value', 'type', 'expires_at']);
    await queryInterface.addIndex({ tableName: 'verification_codes', schema: SCHEMA }, ['origin_session_id'], {
      name: 'idx_verification_codes_origin_session_id'
    });
  },

  async down(queryInterface, Sequelize) {
    // Orden: primero la tabla, luego el tipo. Al revés, Postgres rechaza el DROP TYPE porque la
    // columna `type` todavía depende del enum ("otros objetos dependen de él").
    await queryInterface.dropTable({ tableName: 'verification_codes', schema: SCHEMA });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${SCHEMA}"."enum_verification_codes_type";`);
  }
};
