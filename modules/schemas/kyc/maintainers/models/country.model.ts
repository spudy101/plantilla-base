import { DataTypes } from 'sequelize';
import constantsModule from '../../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineDepartment from './department.model';

function defineCountry(sequelize: Sequelize): defineCountry.Static {
  const Country = sequelize.define<defineCountry.Instance>(
    'Country',
    {
      country_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
      },

      code: {
        type: DataTypes.STRING(3),
        allowNull: false,
        unique: true,
        comment: 'ISO 3166-1 alpha-3 code'
      },

      icon_url: {
        type: DataTypes.STRING(255),
        allowNull: true
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    },
    {
      tableName: 'countries',
      schema: database.schema,
      timestamps: true
    }
  ) as defineCountry.Static;

  Country.associate = models => {
    Country.hasMany(models.Department, {
      foreignKey: 'country_id',
      as: 'departments'
    });
  };

  return Country;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineCountry {
  /** Columnas de countries. */
  export interface Attributes {
    country_id: string;
    name: string;
    /** ISO 3166-1 alpha-3 code */
    code: string;
    icon_url: string | null;
    is_active: boolean | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'country_id' | 'icon_url' | 'is_active' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** HasMany → Department (solo si viene en el include) */
    departments?: defineDepartment.Instance[];
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default defineCountry;
