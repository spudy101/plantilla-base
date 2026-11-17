// migrations/20260418000002-create-privacy-policies.ts
//
// Tabla de versionamiento de políticas de privacidad.
// Solo se insertan nuevas versiones — nunca se editan ni eliminan.
// La versión activa es la única con is_active = true.
//
// Requerido por:
//   - Ley 1581 de 2012 (Colombia)
//   - Apple App Store / Google Play Store

// === RF-LP-01: Landing Page & UX Pública — Tabla de documentos legales ===

import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'privacy_policies', schema: SCHEMA },
      {
        privacy_policy_id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false,
          defaultValue: Sequelize.UUIDV4
        },
        version: {
          type: Sequelize.STRING(20),
          allowNull: false,
          unique: true,
          comment: 'Versión semántica del documento (ej: "1.0", "1.1", "2.0")'
        },
        document_url: {
          type: Sequelize.STRING(500),
          allowNull: false,
          comment: 'URL pública del PDF (repositorio o S3)'
        },
        document_hash: {
          type: Sequelize.STRING(64),
          allowNull: true,
          comment: 'Hash SHA-256 (hex) del archivo para verificación de integridad (RF-ADM-05 CA-2)'
        },
        summary: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'Resumen de los cambios respecto a la versión anterior'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: 'Solo una versión puede estar activa a la vez'
        },
        effective_date: {
          type: Sequelize.DATE,
          allowNull: false,
          comment: 'Fecha desde la que esta versión entra en vigor'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false
        }
        // TODO [RF-LP-01][CA-03]: Faltan columnas estructuradas requeridas por Ley 1581/2012:
        //   - responsible_name, responsible_email, responsible_phone (responsable del tratamiento)
        //   - data_purposes JSONB (finalidad del dato)
        //   - arco_rights JSONB (enlace y procedimiento derechos ARCO)
        //   - contact_channels JSONB (email DPO, teléfono, dirección)
        // Actualmente el contenido legal está en PDF externo (S3/CloudFront); la app solo almacena la URL
      }
    );

    await queryInterface.addIndex({ tableName: 'privacy_policies', schema: SCHEMA }, ['is_active'], {
      name: 'privacy_policies_is_active_idx'
    });

    await queryInterface.addIndex({ tableName: 'privacy_policies', schema: SCHEMA }, ['version'], {
      name: 'privacy_policies_version_idx'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ tableName: 'privacy_policies', schema: SCHEMA });
  }
} satisfies Migration;
