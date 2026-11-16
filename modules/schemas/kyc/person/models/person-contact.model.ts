import sequelizeModule = require('sequelize');
const { DataTypes } = sequelizeModule;
import constantsModule = require('../../../../../shared/constants');
const { database } = constantsModule;
import EncryptionUtil = require('../../../../../shared/utils/encryption.util');
import HashUtil = require('../../../../../shared/utils/hash.util');
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type definePerson = require('./person.model');
import type definePhonePrefix = require('../../maintainers/models/phone-prefix.model');







function definePersonContact(sequelize: Sequelize): definePersonContact.Static {
  const PersonContact = sequelize.define<definePersonContact.Instance>(
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
          const decrypt = (record: definePersonContact.Instance | null | undefined) => {
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
          // Array.isArray no estrecha el readonly Instance[] que entrega el hook
          (Array.isArray(result) ? (result as readonly definePersonContact.Instance[]) : [result as definePersonContact.Instance]).forEach(decrypt);
        }
      }
    }
  ) as definePersonContact.Static;

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
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace definePersonContact {
  /** Columnas de person_contacts. */
  export interface Attributes {
    person_contact_id: string;
    person_id: string;
    /** Cifrado AES-256-GCM */
    email: string;
    /** HMAC-SHA256(email, HASH_PEPPER) — solo para búsquedas WHERE */
    email_hash: string | null;
    email_verified_at: Date | null;
    /** Cifrado AES-256-GCM */
    phone_primary: string | null;
    /** HMAC-SHA256(phone_primary, HASH_PEPPER) — solo para búsquedas WHERE */
    phone_primary_hash: string | null;
    phone_primary_prefix_id: string | null;
    phone_primary_verified_at: Date | null;
    /** Cifrado AES-256-GCM */
    phone_secondary: string | null;
    /** HMAC-SHA256(phone_secondary, HASH_PEPPER) — solo para búsquedas WHERE */
    phone_secondary_hash: string | null;
    phone_secondary_prefix_id: string | null;
    phone_secondary_verified_at: Date | null;
    origin_session_id: string | null;
    origin_correlation_id: string | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'person_contact_id' | 'email_hash' | 'email_verified_at' | 'phone_primary' | 'phone_primary_hash' | 'phone_primary_prefix_id' | 'phone_primary_verified_at' | 'phone_secondary' | 'phone_secondary_hash' | 'phone_secondary_prefix_id' | 'phone_secondary_verified_at' | 'origin_session_id' | 'origin_correlation_id' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → Person (solo si viene en el include) */
    person?: definePerson.Instance | null;
    /** BelongsTo → PhonePrefix (solo si viene en el include) */
    phone_primary_prefix?: definePhonePrefix.Instance | null;
    /** BelongsTo → PhonePrefix (solo si viene en el include) */
    phone_secondary_prefix?: definePhonePrefix.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export = definePersonContact;
