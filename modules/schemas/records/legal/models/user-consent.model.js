const { DataTypes } = require('sequelize');
const { database } = require('../../../../../shared/constants');

module.exports = sequelize => {
  const UserConsent = sequelize.define(
    'UserConsent',
    {
      user_consent_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      consent_type_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      privacy_policy_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      granted_at: {
        type: DataTypes.DATE,
        allowNull: false
      },
      granted_ip: {
        type: DataTypes.STRING(45),
        allowNull: true
      },
      granted_user_agent: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      revoked_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      revoked_ip: {
        type: DataTypes.STRING(45),
        allowNull: true
      },
      revocation_reason: {
        type: DataTypes.STRING(500),
        allowNull: true
      },
      is_current: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
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
      tableName: 'user_consents',
      schema: database.schema,
      timestamps: true,
      underscored: true
    }
  );

  UserConsent.associate = models => {
    UserConsent.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
    UserConsent.belongsTo(models.ConsentType, {
      foreignKey: 'consent_type_id',
      as: 'consentType'
    });
    UserConsent.belongsTo(models.PrivacyPolicy, {
      foreignKey: 'privacy_policy_id',
      as: 'privacyPolicy'
    });
  };

  return UserConsent;
};
