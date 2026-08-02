// modules/schemas/kyc/models/person-reference.model.js

const { DataTypes } = require('sequelize');
const { database } = require('../../../../../shared/constants');

module.exports = sequelize => {
  const PersonReference = sequelize.define(
    'PersonReference',
    {
      person_reference_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      person_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'Persona dueña de la referencia'
      },

      reference_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: 'Nombre completo de la referencia'
      },

      reference_phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'Teléfono de contacto de la referencia'
      },

      reference_type: {
        type: DataTypes.ENUM('conocido', 'familiar'),
        allowNull: false,
        comment: 'Tipo de referencia: conocido (amigo, colega) o familiar'
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'false cuando el cliente elimina la referencia (soft delete)'
      },

      // Trazabilidad de sesión: ata la fila a user_sessions / audit_logs.session_id.
      // Se fotografía al CREAR; null en creaciones de worker/sistema.
      origin_session_id: {
        type: DataTypes.UUID,
        allowNull: true
      },

      origin_correlation_id: {
        type: DataTypes.STRING(128),
        allowNull: true
      }
    },
    {
      tableName: 'person_references',
      schema: database.schema,
      timestamps: true,
      underscored: true
    }
  );

  PersonReference.associate = models => {
    PersonReference.belongsTo(models.Person, {
      foreignKey: 'person_id',
      as: 'person',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  };

  return PersonReference;
};
