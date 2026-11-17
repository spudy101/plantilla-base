// migrations/20260522000003-create-person-references.ts

import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'person_references', schema: SCHEMA },
      {
        person_reference_id: {
          type: Sequelize.UUID,
          primaryKey: true,
          defaultValue: Sequelize.UUIDV4,
          allowNull: false
        },
        person_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: { tableName: 'persons', schema: SCHEMA },
            key: 'person_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
          comment: 'Persona dueña de la referencia'
        },
        reference_name: {
          type: Sequelize.STRING(200),
          allowNull: false,
          comment: 'Nombre completo de la referencia'
        },
        reference_phone: {
          type: Sequelize.STRING(20),
          allowNull: false,
          comment: 'Teléfono de contacto de la referencia'
        },
        reference_type: {
          type: Sequelize.ENUM('conocido', 'familiar'),
          allowNull: false,
          comment: 'Tipo de referencia: conocido (amigo, colega) o familiar'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: 'false cuando el cliente la elimina (soft delete)'
        },

        // ── Trazabilidad de sesión: ata la fila a user_sessions / audit_logs.session_id. null en workers ──
        origin_session_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: 'session_id de auth que registró la referencia'
        },
        origin_correlation_id: {
          type: Sequelize.STRING(128),
          allowNull: true,
          comment: 'correlationId del request que registró la referencia'
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

    await queryInterface.addIndex({ tableName: 'person_references', schema: SCHEMA }, ['person_id'], {
      name: 'idx_person_references_person_id'
    });

    await queryInterface.addIndex({ tableName: 'person_references', schema: SCHEMA }, ['reference_type'], {
      name: 'idx_person_references_type'
    });

    await queryInterface.addIndex({ tableName: 'person_references', schema: SCHEMA }, ['person_id', 'is_active'], {
      name: 'idx_person_references_person_active'
    });

    await queryInterface.addIndex({ tableName: 'person_references', schema: SCHEMA }, ['origin_session_id'], {
      name: 'idx_person_references_origin_session_id'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ tableName: 'person_references', schema: SCHEMA });
  }
} satisfies Migration;
