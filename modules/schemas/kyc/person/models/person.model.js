const { DataTypes } = require('sequelize');
const { database } = require('../../../../../shared/constants');
const EncryptionUtil = require('../../../../../shared/utils/encryption.util');
const HashUtil = require('../../../../../shared/utils/hash.util');

module.exports = sequelize => {
  const Person = sequelize.define(
    'Person',
    {
      person_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      first_name: {
        type: DataTypes.STRING(100),
        allowNull: false
      },

      last_name: {
        type: DataTypes.STRING(100),
        allowNull: false
      },

      middle_name: {
        type: DataTypes.STRING(100),
        allowNull: true
      },

      second_last_name: {
        type: DataTypes.STRING(100),
        allowNull: true
      },

      national_id: {
        type: DataTypes.STRING(150),
        allowNull: true,
        unique: true,
        comment: 'Cifrado AES-256-GCM — formato: ivHex:authTagHex:ciphertextHex'
      },

      national_id_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        unique: true,
        comment: 'HMAC-SHA256(national_id, HASH_PEPPER) — solo para búsquedas WHERE'
      },

      birth_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },

      gender_id: {
        type: DataTypes.UUID,
        allowNull: true
      },

      country_id: {
        type: DataTypes.UUID,
        allowNull: true
      },

      // FK al catálogo de tipos de documento — nullable para compatibilidad con registros previos
      document_type_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Tipo de documento de identidad — FK a document_types'
      },

      // Trazabilidad de sesión. Mixto: null cuando la fila nace en el registro público (pre-sesión),
      // con valor cuando la crea un admin o el propio cliente ya autenticado.
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
      tableName: 'persons',
      schema: database.schema,
      timestamps: true,
      paranoid: false,
      hooks: {
        // Cifrar national_id y generar hash para búsquedas antes de guardar
        beforeCreate: person => {
          if (person.national_id) {
            person.national_id_hash = HashUtil.hashForSearch(person.national_id);
            person.national_id = EncryptionUtil.encrypt(person.national_id);
          }
        },
        beforeUpdate: person => {
          if (person.changed('national_id') && person.national_id) {
            person.national_id_hash = HashUtil.hashForSearch(person.national_id);
            person.national_id = EncryptionUtil.encrypt(person.national_id);
          }
        },
        // Descifrar national_id al leer
        afterFind: result => {
          if (!result) {
            return;
          }
          const decrypt = record => {
            if (!record) {
              return;
            }

            // Descifrar national_id de esta person
            if (record.national_id) {
              try {
                record.national_id = EncryptionUtil.decrypt(record.national_id);
              } catch {
                /* valor no cifrado (datos legacy) — se deja como está */
              }
            }

            // Descifrar contact anidado — Sequelize 6 no siempre dispara
            // el afterFind del modelo hijo cuando viene en un include
            const contact = record.contact ?? record.dataValues?.contact;
            if (contact) {
              const c = contact.dataValues ?? contact;
              try {
                if (c.email) {
                  c.email = EncryptionUtil.decrypt(c.email);
                }
              } catch {
                /* legacy */
              }
              try {
                if (c.phone_primary) {
                  c.phone_primary = EncryptionUtil.decrypt(c.phone_primary);
                }
              } catch {
                /* legacy */
              }
              try {
                if (c.phone_secondary) {
                  c.phone_secondary = EncryptionUtil.decrypt(c.phone_secondary);
                }
              } catch {
                /* legacy */
              }
            }
          };
          Array.isArray(result) ? result.forEach(decrypt) : decrypt(result);
        }
      }
    }
  );

  Person.associate = models => {
    Person.belongsTo(models.Gender, {
      foreignKey: 'gender_id',
      as: 'gender',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    Person.belongsTo(models.Country, {
      foreignKey: 'country_id',
      as: 'country',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    Person.belongsTo(models.DocumentType, {
      foreignKey: 'document_type_id',
      as: 'document_type',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });

    Person.hasMany(models.PersonReference, {
      foreignKey: 'person_id',
      as: 'references',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    Person.hasOne(models.PersonContact, {
      foreignKey: 'person_id',
      as: 'contact',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    Person.hasOne(models.PersonLocation, {
      foreignKey: 'person_id',
      as: 'location',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    Person.hasOne(models.User, {
      foreignKey: 'person_id',
      as: 'user'
    });
  };

  return Person;
};
