// migrations/20250108000011-create-person-contacts.ts

import type { Migration } from '../shared/types/migration';
import constantsModule = require('../shared/constants');
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'person_contacts', schema: SCHEMA },
      {
        person_contact_id: {
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
        // EMAIL
        email: {
          type: Sequelize.STRING(500),
          allowNull: false,
          unique: true,
          comment: 'Cifrado AES-256-GCM'
        },
        email_hash: {
          type: Sequelize.STRING(64),
          allowNull: true,
          unique: true,
          comment: 'HMAC-SHA256(email, HASH_PEPPER) — solo para búsquedas WHERE'
        },
        email_verified_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        // PRIMARY PHONE (obligatorio verificar)
        phone_primary: {
          type: Sequelize.STRING(150),
          allowNull: true,
          comment: 'Cifrado AES-256-GCM'
        },
        phone_primary_hash: {
          type: Sequelize.STRING(64),
          allowNull: true,
          comment: 'HMAC-SHA256(phone_primary, HASH_PEPPER) — solo para búsquedas WHERE'
        },
        phone_primary_prefix_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: { tableName: 'phone_prefixes', schema: SCHEMA },
            key: 'phone_prefix_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        phone_primary_verified_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        // SECONDARY PHONE (opcional, whatsapp, etc)
        phone_secondary: {
          type: Sequelize.STRING(150),
          allowNull: true,
          comment: 'Cifrado AES-256-GCM'
        },
        phone_secondary_hash: {
          type: Sequelize.STRING(64),
          allowNull: true,
          comment: 'HMAC-SHA256(phone_secondary, HASH_PEPPER) — solo para búsquedas WHERE'
        },
        phone_secondary_prefix_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: { tableName: 'phone_prefixes', schema: SCHEMA },
            key: 'phone_prefix_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        phone_secondary_verified_at: {
          type: Sequelize.DATE,
          allowNull: true
        },

        // ── Trazabilidad de sesión. Mixto: null cuando la fila nace en el registro público o en el
        //    prefill (pre-sesión), con valor cuando la crea un admin o el propio cliente ya autenticado ──
        origin_session_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: 'session_id de auth que registró el contacto'
        },
        origin_correlation_id: {
          type: Sequelize.STRING(128),
          allowNull: true,
          comment: 'correlationId del request que registró el contacto'
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

    await queryInterface.addIndex({ tableName: 'person_contacts', schema: SCHEMA }, ['email']);
    await queryInterface.addIndex({ tableName: 'person_contacts', schema: SCHEMA }, ['email_hash'], {
      name: 'idx_person_contacts_email_hash'
    });
    await queryInterface.addIndex({ tableName: 'person_contacts', schema: SCHEMA }, ['phone_primary']);
    await queryInterface.addIndex({ tableName: 'person_contacts', schema: SCHEMA }, ['phone_primary_hash'], {
      name: 'idx_person_contacts_phone_primary_hash'
    });
    await queryInterface.addIndex({ tableName: 'person_contacts', schema: SCHEMA }, ['phone_secondary']);
    await queryInterface.addIndex({ tableName: 'person_contacts', schema: SCHEMA }, ['phone_secondary_hash'], {
      name: 'idx_person_contacts_phone_secondary_hash'
    });
    await queryInterface.addIndex({ tableName: 'person_contacts', schema: SCHEMA }, ['email_verified_at']);
    await queryInterface.addIndex({ tableName: 'person_contacts', schema: SCHEMA }, ['phone_primary_verified_at']);
    // Índice compuesto para verificación de email
    await queryInterface.addIndex({ tableName: 'person_contacts', schema: SCHEMA }, ['email', 'email_verified_at']);
    await queryInterface.addIndex({ tableName: 'person_contacts', schema: SCHEMA }, ['origin_session_id'], {
      name: 'idx_person_contacts_origin_session_id'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ tableName: 'person_contacts', schema: SCHEMA });
  }
} satisfies Migration;
