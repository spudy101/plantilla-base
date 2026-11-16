import sequelizeModule = require('sequelize');
const { DataTypes } = sequelizeModule;
import constantsModule = require('../../../../../shared/constants');
const { database } = constantsModule;
import EncryptionUtil = require('../../../../../shared/utils/encryption.util');
import HashUtil = require('../../../../../shared/utils/hash.util');
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineCountry = require('../../maintainers/models/country.model');
import type defineDocumentType = require('../../maintainers/models/document-type.model');
import type defineGender = require('../../maintainers/models/gender.model');
import type definePersonContact = require('./person-contact.model');
import type definePersonLocation = require('./person-location.model');
import type definePersonReference = require('./person-reference.model');
import type defineUser = require('../../iam/models/user.model');







function definePerson(sequelize: Sequelize): definePerson.Static {
  const Person = sequelize.define<definePerson.Instance>(
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
          const decrypt = (record: definePerson.Instance | null | undefined) => {
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
            const contact = record.contact ?? (record.dataValues as { contact?: definePersonContact.Instance } | undefined)?.contact;
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
          // Array.isArray no estrecha el readonly Instance[] que entrega el hook
          (Array.isArray(result) ? (result as readonly definePerson.Instance[]) : [result as definePerson.Instance]).forEach(decrypt);
        }
      }
    }
  ) as definePerson.Static;

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
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace definePerson {
  /** Columnas de persons. */
  export interface Attributes {
    person_id: string;
    first_name: string;
    last_name: string;
    middle_name: string | null;
    second_last_name: string | null;
    /** Cifrado AES-256-GCM — formato: ivHex:authTagHex:ciphertextHex */
    national_id: string | null;
    /** HMAC-SHA256(national_id, HASH_PEPPER) — solo para búsquedas WHERE */
    national_id_hash: string | null;
    birth_date: string | null;
    gender_id: string | null;
    country_id: string | null;
    /** Tipo de documento de identidad — FK a document_types */
    document_type_id: string | null;
    origin_session_id: string | null;
    origin_correlation_id: string | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'person_id' | 'middle_name' | 'second_last_name' | 'national_id' | 'national_id_hash' | 'birth_date' | 'gender_id' | 'country_id' | 'document_type_id' | 'origin_session_id' | 'origin_correlation_id' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → Gender (solo si viene en el include) */
    gender?: defineGender.Instance | null;
    /** BelongsTo → Country (solo si viene en el include) */
    country?: defineCountry.Instance | null;
    /** BelongsTo → DocumentType (solo si viene en el include) */
    document_type?: defineDocumentType.Instance | null;
    /** HasMany → PersonReference (solo si viene en el include) */
    references?: definePersonReference.Instance[];
    /** HasOne → PersonContact (solo si viene en el include) */
    contact?: definePersonContact.Instance | null;
    /** HasOne → PersonLocation (solo si viene en el include) */
    location?: definePersonLocation.Instance | null;
    /** HasOne → User (solo si viene en el include) */
    user?: defineUser.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export = definePerson;
