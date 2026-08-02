// modules/schemas/kyc/models/document-type.model.js

const { DataTypes } = require('sequelize');
const { database } = require('../../../../../shared/constants');

module.exports = sequelize => {
  const DocumentType = sequelize.define(
    'DocumentType',
    {
      document_type_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      // Sigla del tipo de documento (CC, CE, TI, PA, PPT, SYSTEM)
      code: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        comment: 'Sigla del tipo de documento — ej: CC, CE, TI, PA, PPT'
      },
      // Nombre completo legible para el usuario
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'Nombre completo del tipo de documento'
      },
      // Si es false, no se muestra en el selector del formulario de registro
      is_visible_to_client: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Si es false, el tipo es interno y no se expone al cliente'
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      }
    },
    {
      tableName: 'document_types',
      schema: database.schema,
      timestamps: true,
      underscored: true
    }
  );

  DocumentType.associate = models => {
    DocumentType.hasMany(models.Person, {
      foreignKey: 'document_type_id',
      as: 'persons',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });
  };

  return DocumentType;
};
