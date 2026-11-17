// migrations/20260520000001-create-document-types.ts

import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'document_types', schema: SCHEMA },
      {
        document_type_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4
        },
        // Sigla del tipo de documento (CC, CE, TI, PA, PPT, SYSTEM)
        code: {
          type: Sequelize.STRING(20),
          allowNull: false,
          unique: true,
          comment: 'Sigla del tipo de documento — ej: CC, CE, TI, PA, PPT, SYSTEM'
        },
        // Nombre completo de la sigla
        name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: 'Nombre completo del tipo de documento — ej: Cédula de Ciudadanía'
        },
        // Falso = tipo interno (ej: SYSTEM) que no se muestra al cliente en el formulario
        is_visible_to_client: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: 'Si es false, el tipo es interno y no se muestra al cliente'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true
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

    await queryInterface.addIndex({ tableName: 'document_types', schema: SCHEMA }, ['code'], {
      unique: true
    });
    await queryInterface.addIndex({ tableName: 'document_types', schema: SCHEMA }, ['is_visible_to_client']);
    await queryInterface.addIndex({ tableName: 'document_types', schema: SCHEMA }, ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ tableName: 'document_types', schema: SCHEMA });
  }
} satisfies Migration;
