const { DataTypes } = require('sequelize');
const { database } = require('../../../../../shared/constants');

module.exports = sequelize => {
  const ConsentType = sequelize.define(
    'ConsentType',
    {
      consent_type_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      is_mandatory: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      is_revocable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      scope: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'ONBOARDING'
      }
    },
    {
      tableName: 'consent_types',
      schema: database.schema,
      timestamps: true,
      underscored: true
    }
  );

  ConsentType.associate = models => {
    ConsentType.hasMany(models.UserConsent, {
      foreignKey: 'consent_type_id',
      as: 'userConsents'
    });
  };

  return ConsentType;
};
