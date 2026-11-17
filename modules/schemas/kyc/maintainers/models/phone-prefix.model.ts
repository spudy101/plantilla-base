import { DataTypes } from 'sequelize';
import constantsModule from '../../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineCountry from './country.model';

function definePhonePrefix(sequelize: Sequelize): definePhonePrefix.Static {
  const PhonePrefix = sequelize.define<definePhonePrefix.Instance>(
    'PhonePrefix',
    {
      phone_prefix_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      prefix: {
        type: DataTypes.STRING(10),
        allowNull: false,
        comment: 'Phone prefix with + (e.g., +56, +1)'
      },

      country_id: {
        type: DataTypes.UUID,
        allowNull: false
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    },
    {
      tableName: 'phone_prefixes',
      schema: database.schema,
      timestamps: true
    }
  ) as definePhonePrefix.Static;

  PhonePrefix.associate = models => {
    PhonePrefix.belongsTo(models.Country, {
      foreignKey: 'country_id',
      as: 'country',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });
  };

  return PhonePrefix;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace definePhonePrefix {
  /** Columnas de phone_prefixes. */
  export interface Attributes {
    phone_prefix_id: string;
    /** Phone prefix with + (e.g., +56, +1) */
    prefix: string;
    country_id: string;
    is_active: boolean | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'phone_prefix_id' | 'is_active' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → Country (solo si viene en el include) */
    country?: defineCountry.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default definePhonePrefix;
