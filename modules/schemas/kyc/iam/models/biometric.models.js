const { DataTypes } = require('sequelize');
const { database } = require('../../../../../shared/constants');

// ============================================================
// UserBiometricCredential
// ============================================================

const UserBiometricCredentialModel = sequelize => {
  const UserBiometricCredential = sequelize.define(
    'UserBiometricCredential',
    {
      biometric_credential_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      user_trusted_device_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      credential_id: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      public_key: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      sign_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      last_used_at: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: 'user_biometric_credentials',
      schema: database.schema,
      timestamps: true
    }
  );

  UserBiometricCredential.associate = models => {
    UserBiometricCredential.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
    UserBiometricCredential.belongsTo(models.UserTrustedDevice, {
      foreignKey: 'user_trusted_device_id',
      as: 'trustedDevice'
    });
  };

  return UserBiometricCredential;
};

// ============================================================
// BiometricChallenge
// ============================================================

const BiometricChallengeModel = sequelize => {
  const BiometricChallenge = sequelize.define(
    'BiometricChallenge',
    {
      challenge_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      challenge: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      type: {
        type: DataTypes.STRING(20),
        allowNull: false
      },
      used: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false
      }
    },
    {
      tableName: 'biometric_challenges',
      schema: database.schema,
      timestamps: true,
      updatedAt: false // la tabla solo tiene created_at
    }
  );

  BiometricChallenge.associate = models => {
    BiometricChallenge.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
  };

  return BiometricChallenge;
};

module.exports = { UserBiometricCredentialModel, BiometricChallengeModel };
