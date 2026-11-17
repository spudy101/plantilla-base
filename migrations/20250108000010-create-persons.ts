// migrations/20250108000010-create-persons.ts

import type { Migration } from '../shared/types/migration';
import constantsModule = require('../shared/constants');
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'persons', schema: SCHEMA },
      {
        person_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4
        },
        first_name: {
          type: Sequelize.STRING(100),
          allowNull: false
        },
        last_name: {
          type: Sequelize.STRING(100),
          allowNull: false
        },
        middle_name: {
          type: Sequelize.STRING(100),
          allowNull: true
        },
        second_last_name: {
          type: Sequelize.STRING(100),
          allowNull: true
        },
        national_id: {
          type: Sequelize.STRING(150),
          allowNull: true,
          unique: true,
          comment: 'Cifrado AES-256-GCM — formato: ivHex:authTagHex:ciphertextHex'
        },
        national_id_hash: {
          type: Sequelize.STRING(64),
          allowNull: true,
          unique: true,
          comment: 'HMAC-SHA256(national_id, HASH_PEPPER) — solo para búsquedas WHERE'
        },
        document_type_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: { tableName: 'document_types', schema: SCHEMA },
            key: 'document_type_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
          comment: 'Tipo de documento de identidad — FK a document_types'
        },
        birth_date: {
          type: Sequelize.DATEONLY,
          allowNull: true
        },
        gender_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: { tableName: 'genders', schema: SCHEMA },
            key: 'gender_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        country_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: { tableName: 'countries', schema: SCHEMA },
            key: 'country_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        // ── Trazabilidad de sesión. Mixto: null cuando la fila nace en el registro público (pre-sesión),
        //    con valor cuando la crea un admin o el propio cliente ya autenticado ──
        origin_session_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: 'session_id de auth que creó la persona'
        },
        origin_correlation_id: {
          type: Sequelize.STRING(128),
          allowNull: true,
          comment: 'correlationId del request que creó la persona'
        },

        created_at: {
          allowNull: false,
          type: Sequelize.DATE
        },
        updated_at: {
          allowNull: false,
          type: Sequelize.DATE
        },
        deletedAt: {
          type: Sequelize.DATE,
          allowNull: true
        }
      }
    );

    await queryInterface.addIndex({ tableName: 'persons', schema: SCHEMA }, ['national_id']);
    await queryInterface.addIndex({ tableName: 'persons', schema: SCHEMA }, ['national_id_hash'], {
      name: 'idx_persons_national_id_hash'
    });
    await queryInterface.addIndex({ tableName: 'persons', schema: SCHEMA }, ['document_type_id']);
    await queryInterface.addIndex({ tableName: 'persons', schema: SCHEMA }, ['gender_id']);
    await queryInterface.addIndex({ tableName: 'persons', schema: SCHEMA }, ['country_id']);
    await queryInterface.addIndex({ tableName: 'persons', schema: SCHEMA }, ['deletedAt']);
    // Índice compuesto para búsquedas por nombre completo
    await queryInterface.addIndex({ tableName: 'persons', schema: SCHEMA }, ['first_name', 'last_name']);
    await queryInterface.addIndex({ tableName: 'persons', schema: SCHEMA }, ['origin_session_id'], {
      name: 'idx_persons_origin_session_id'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ tableName: 'persons', schema: SCHEMA });
  }
} satisfies Migration;
