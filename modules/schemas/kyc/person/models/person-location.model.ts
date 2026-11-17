import { DataTypes } from 'sequelize';
import constantsModule from '../../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineCity from '../../maintainers/models/city.model';
import type defineCountry from '../../maintainers/models/country.model';
import type defineDepartment from '../../maintainers/models/department.model';
import type definePerson from './person.model';

function definePersonLocation(sequelize: Sequelize): definePersonLocation.Static {
  const PersonLocation = sequelize.define<definePersonLocation.Instance>(
    'PersonLocation',
    {
      person_location_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      person_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true
      },

      country_id: {
        type: DataTypes.UUID,
        allowNull: true
      },

      department_id: {
        type: DataTypes.UUID,
        allowNull: false
      },

      city_id: {
        type: DataTypes.UUID,
        allowNull: false
      },

      address: {
        type: DataTypes.STRING(100),
        allowNull: false
      },

      postal_code: {
        type: DataTypes.STRING(40),
        allowNull: true
      },

      type: {
        type: DataTypes.STRING(40),
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
      tableName: 'person_locations',
      schema: database.schema,
      timestamps: true
    }
  ) as definePersonLocation.Static;

  PersonLocation.associate = models => {
    PersonLocation.belongsTo(models.Person, {
      foreignKey: 'person_id',
      as: 'person',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    PersonLocation.belongsTo(models.Country, {
      foreignKey: 'country_id',
      as: 'country',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    PersonLocation.belongsTo(models.Department, {
      foreignKey: 'department_id',
      as: 'department',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    PersonLocation.belongsTo(models.City, {
      foreignKey: 'city_id',
      as: 'city',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  };

  return PersonLocation;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace definePersonLocation {
  /** Columnas de person_locations. */
  export interface Attributes {
    person_location_id: string;
    person_id: string;
    country_id: string | null;
    department_id: string;
    city_id: string;
    address: string;
    postal_code: string | null;
    type: string | null;
    origin_session_id: string | null;
    origin_correlation_id: string | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'person_location_id' | 'country_id' | 'postal_code' | 'type' | 'origin_session_id' | 'origin_correlation_id' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → Person (solo si viene en el include) */
    person?: definePerson.Instance | null;
    /** BelongsTo → Country (solo si viene en el include) */
    country?: defineCountry.Instance | null;
    /** BelongsTo → Department (solo si viene en el include) */
    department?: defineDepartment.Instance | null;
    /** BelongsTo → City (solo si viene en el include) */
    city?: defineCity.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default definePersonLocation;
