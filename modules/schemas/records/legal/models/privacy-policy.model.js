const { DataTypes } = require('sequelize');
const { database } = require('../../../../../shared/constants');

module.exports = sequelize => {
  const PrivacyPolicy = sequelize.define(
    'PrivacyPolicy',
    {
      privacy_policy_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      version: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        comment: 'Versión semántica del documento (ej: "1.0", "1.1", "2.0")'
      },

      document_url: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: 'URL pública del PDF (repositorio o S3)'
      },

      document_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: 'Hash SHA-256 (hex) del archivo para verificación de integridad (RF-ADM-05 CA-2)'
      },

      summary: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Resumen de los cambios respecto a la versión anterior'
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Solo una versión puede estar activa a la vez'
      },

      effective_date: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Fecha desde la que esta versión entra en vigor'
      }
    },
    {
      tableName: 'privacy_policies',
      schema: database.schema,
      timestamps: true
    }
  );

  return PrivacyPolicy;
};
