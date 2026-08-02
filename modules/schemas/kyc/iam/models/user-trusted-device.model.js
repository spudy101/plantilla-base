// === RF-AUTH-03: Gestión de Dispositivos Autenticados y Control de Sesiones ===
// [RF-AUTH-03] | CA-01, CA-03 | Tabla user_trusted_devices: dispositivos conocidos
// por usuario con fingerprint_hash, status, geolocalización y metadata de browser/os
// Todos los logAudit relativos a dispositivos usan entityTable='user_trusted_devices'.

const { DataTypes } = require('sequelize');
const { database } = require('../../../../../shared/constants');
const EncryptionUtil = require('../../../../../shared/utils/encryption.util');

module.exports = sequelize => {
  const UserTrustedDevice = sequelize.define(
    'UserTrustedDevice',
    {
      user_trusted_device_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false
      },

      // ── Identificación ───────────────────────────────────────
      fingerprint_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: 'SHA-256 del User-Agent normalizado (sin IP)'
      },
      device_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'Generado automáticamente desde User-Agent, editable por el usuario'
      },

      // ── Estado ───────────────────────────────────────────────
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'pending | trusted | blocked'
      },

      // ── Info de red y geo ────────────────────────────────────
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true
      },
      city: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      country: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      country_code: {
        type: DataTypes.STRING(5),
        allowNull: true
      },

      // ── Info del User-Agent ──────────────────────────────────
      browser: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      os: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      device_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'desktop'
      },

      // ── Aprobación ───────────────────────────────────────────
      approved_by_device_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      approved_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      // ── Bloqueo ─────────────────────────────────────────────
      blocked_by_device_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Dispositivo trusted que ejecutó el bloqueo'
      },
      blocked_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      // ── Timestamps de actividad ──────────────────────────────
      trusted_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      last_seen_at: {
        type: DataTypes.DATE,
        allowNull: false
      },
      hmac_secret: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: 'Secret HMAC único por dispositivo cifrado AES-256-GCM — anti-replay para mobile'
      },

      // Trazabilidad de sesión. El dispositivo se registra DURANTE el login, antes de que la sesión
      // exista (y es su padre: user_sessions.device_id apunta acá) → origin_session_id null por diseño.
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
      tableName: 'user_trusted_devices',
      schema: database.schema,
      timestamps: true,
      hooks: {
        // Cifrar hmac_secret antes de guardar en BD
        beforeCreate: device => {
          if (device.hmac_secret) {
            device.hmac_secret = EncryptionUtil.encrypt(device.hmac_secret);
          }
        },
        beforeUpdate: device => {
          if (device.changed('hmac_secret') && device.hmac_secret) {
            device.hmac_secret = EncryptionUtil.encrypt(device.hmac_secret);
          }
        },
        // Descifrar al leer — el HmacService recibe el valor en texto plano
        afterFind: result => {
          if (!result) {
            return;
          }
          const decrypt = record => {
            if (record?.hmac_secret) {
              try {
                record.hmac_secret = EncryptionUtil.decrypt(record.hmac_secret);
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

  UserTrustedDevice.associate = models => {
    UserTrustedDevice.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });

    // Auto-referencia: el dispositivo que aprobó a este
    UserTrustedDevice.belongsTo(models.UserTrustedDevice, {
      foreignKey: 'approved_by_device_id',
      as: 'approvedByDevice'
    });

    UserTrustedDevice.hasMany(models.UserSession, {
      foreignKey: 'device_id',
      as: 'sessions'
    });
  };

  return UserTrustedDevice;
};
