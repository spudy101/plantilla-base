import type { Migration } from '../shared/types/migration';
import constantsModule = require('../shared/constants');
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'user_consents', schema: SCHEMA },
      {
        user_consent_id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false,
          defaultValue: Sequelize.UUIDV4
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: { tableName: 'users', schema: SCHEMA }, key: 'user_id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        consent_type_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: { tableName: 'consent_types', schema: SCHEMA }, key: 'consent_type_id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        privacy_policy_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: { tableName: 'privacy_policies', schema: SCHEMA }, key: 'privacy_policy_id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
          comment: 'Solo aplica para el tipo PRIVACY_POLICY — versión específica aceptada'
        },
        granted_at: {
          type: Sequelize.DATE,
          allowNull: false
        },
        granted_ip: {
          type: Sequelize.STRING(45),
          allowNull: true
        },
        granted_user_agent: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        revoked_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        revoked_ip: {
          type: Sequelize.STRING(45),
          allowNull: true
        },
        revocation_reason: {
          type: Sequelize.STRING(500),
          allowNull: true
        },
        is_current: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: 'true = registro activo para este user+consent_type. Solo uno activo a la vez.'
        },

        // ── Trazabilidad de sesión: ata la fila a user_sessions / audit_logs.session_id. null en workers ──
        origin_session_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: 'session_id de auth que otorgó el consentimiento'
        },
        origin_correlation_id: {
          type: Sequelize.STRING(128),
          allowNull: true,
          comment: 'correlationId del request que otorgó el consentimiento'
        },

        created_at: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false
        }
      }
    );

    await queryInterface.addIndex({ tableName: 'user_consents', schema: SCHEMA }, ['user_id'], {
      name: 'user_consents_user_id_idx'
    });

    await queryInterface.addIndex({ tableName: 'user_consents', schema: SCHEMA }, ['user_id', 'consent_type_id'], {
      name: 'user_consents_user_type_idx'
    });

    await queryInterface.addIndex({ tableName: 'user_consents', schema: SCHEMA }, ['is_current'], {
      name: 'user_consents_is_current_idx'
    });

    await queryInterface.addIndex({ tableName: 'user_consents', schema: SCHEMA }, ['granted_at'], {
      name: 'user_consents_granted_at_idx'
    });

    await queryInterface.addIndex({ tableName: 'user_consents', schema: SCHEMA }, ['origin_session_id'], {
      name: 'idx_user_consents_origin_session_id'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ tableName: 'user_consents', schema: SCHEMA });
  }
} satisfies Migration;
