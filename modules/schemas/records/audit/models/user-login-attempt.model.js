const { DataTypes } = require('sequelize');
const EncryptionUtil = require('../../../../../shared/utils/encryption.util');
const { database } = require('../../../../../shared/constants');

module.exports = sequelize => {
  const UserLoginAttempt = sequelize.define(
    'UserLoginAttempt',
    {
      user_login_attempt_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Null if user not found'
      },

      username_attempt: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Username or email attempted'
      },

      national_id: {
        type: DataTypes.STRING(255),
        allowNull: false
      },

      national_id_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: 'HMAC-SHA256(national_id, HASH_PEPPER) — solo para búsquedas WHERE'
      },

      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: 'IPv4 or IPv6'
      },

      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      device_fingerprint: {
        type: DataTypes.STRING(255),
        allowNull: true
      },

      success: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },

      failure_reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Invalid credentials, account locked, etc.'
      },

      blocked_until: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When the account/IP will be unblocked'
      },

      attempted_at: {
        type: DataTypes.DATE,
        allowNull: false
      },

      // Trazabilidad de sesión. Null en intentos fallidos (la sesión nunca existió); con valor en los
      // exitosos, donde el sessionId se pasa explícito.
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
      tableName: 'user_login_attempts',
      schema: database.schema,
      timestamps: true,
      hooks: {
        // Descifrar national_id al leer — se cifra en el repositorio con AES-256-GCM
        afterFind: result => {
          if (!result) {
            return;
          }
          const decrypt = record => {
            if (!record) {
              return;
            }
            if (record.national_id) {
              try {
                record.national_id = EncryptionUtil.decrypt(record.national_id);
              } catch {
                /* dato no cifrado (legacy) */
              }
            }
          };
          Array.isArray(result) ? result.forEach(decrypt) : decrypt(result);
        }
      }
    }
  );

  UserLoginAttempt.associate = models => {
    UserLoginAttempt.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  };

  return UserLoginAttempt;
};
