const { DataTypes } = require('sequelize');
const { database } = require('../../../../../shared/constants');
const EncryptionUtil = require('../../../../../shared/utils/encryption.util');
const HashUtil = require('../../../../../shared/utils/hash.util');

module.exports = sequelize => {
  const PersonContact = sequelize.define(
    'PersonContact',
    {
      person_contact_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      person_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true
      },

      email: {
        type: DataTypes.STRING(500),
        allowNull: false,
        unique: true,
        comment: 'Cifrado AES-256-GCM'
      },

      email_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        unique: true,
        comment: 'HMAC-SHA256(email, HASH_PEPPER) — solo para búsquedas WHERE'
      },

      email_verified_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      phone_primary: {
        type: DataTypes.STRING(150),
        allowNull: true,
        comment: 'Cifrado AES-256-GCM'
      },

      phone_primary_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: 'HMAC-SHA256(phone_primary, HASH_PEPPER) — solo para búsquedas WHERE'
      },

      phone_primary_prefix_id: {
        type: DataTypes.UUID,
        allowNull: true
      },

      phone_primary_verified_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      phone_secondary: {
        type: DataTypes.STRING(150),
        allowNull: true,
        comment: 'Cifrado AES-256-GCM'
      },

      phone_secondary_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: 'HMAC-SHA256(phone_secondary, HASH_PEPPER) — solo para búsquedas WHERE'
      },

      phone_secondary_prefix_id: {
        type: DataTypes.UUID,
        allowNull: true
      },

      phone_secondary_verified_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      // Trazabilidad de sesión. Mixto: null cuando la fila nace en el registro público o en el prefill
      // (pre-sesión), con valor cuando la crea un admin o el propio cliente ya autenticado.
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
      tableName: 'person_contacts',
      schema: database.schema,
      timestamps: true,
      hooks: {
        beforeCreate: contact => {
          if (contact.email) {
            contact.email_hash = HashUtil.hashForSearch(contact.email);
            contact.email = EncryptionUtil.encrypt(contact.email);
          }
          if (contact.phone_primary) {
            contact.phone_primary_hash = HashUtil.hashForSearch(contact.phone_primary);
            contact.phone_primary = EncryptionUtil.encrypt(contact.phone_primary);
          }
          if (contact.phone_secondary) {
            contact.phone_secondary_hash = HashUtil.hashForSearch(contact.phone_secondary);
            contact.phone_secondary = EncryptionUtil.encrypt(contact.phone_secondary);
          }
        },
        beforeUpdate: contact => {
          if (contact.changed('email') && contact.email) {
            contact.email_hash = HashUtil.hashForSearch(contact.email);
            contact.email = EncryptionUtil.encrypt(contact.email);
          }
          if (contact.changed('phone_primary') && contact.phone_primary) {
            contact.phone_primary_hash = HashUtil.hashForSearch(contact.phone_primary);
            contact.phone_primary = EncryptionUtil.encrypt(contact.phone_primary);
          }
          if (contact.changed('phone_secondary') && contact.phone_secondary) {
            contact.phone_secondary_hash = HashUtil.hashForSearch(contact.phone_secondary);
            contact.phone_secondary = EncryptionUtil.encrypt(contact.phone_secondary);
          }
        },
        afterFind: result => {
          if (!result) {
            return;
          }
          const decrypt = record => {
            if (!record) {
              return;
            }
            try {
              if (record.email) {
                record.email = EncryptionUtil.decrypt(record.email);
              }
            } catch {
              /* legacy */
            }
            try {
              if (record.phone_primary) {
                record.phone_primary = EncryptionUtil.decrypt(record.phone_primary);
              }
            } catch {
              /* legacy */
            }
            try {
              if (record.phone_secondary) {
                record.phone_secondary = EncryptionUtil.decrypt(record.phone_secondary);
              }
            } catch {
              /* legacy */
            }
          };
          Array.isArray(result) ? result.forEach(decrypt) : decrypt(result);
        }
      }
    }
  );

  PersonContact.associate = models => {
    PersonContact.belongsTo(models.Person, {
      foreignKey: 'person_id',
      as: 'person',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    PersonContact.belongsTo(models.PhonePrefix, {
      foreignKey: 'phone_primary_prefix_id',
      as: 'phone_primary_prefix',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });

    PersonContact.belongsTo(models.PhonePrefix, {
      foreignKey: 'phone_secondary_prefix_id',
      as: 'phone_secondary_prefix',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });
  };

  return PersonContact;
};
