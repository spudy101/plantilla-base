import { DataTypes } from 'sequelize';
import constantsModule from '../../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineDepartment from './department.model';

function defineCity(sequelize: Sequelize): defineCity.Static {
  const City = sequelize.define<defineCity.Instance>(
    'City',
    {
      city_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      department_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      // Código DANE numérico 3 dígitos (ej: '001' = capital del departamento)
      // Requerido para reportes DIAN (Formato 1026 y otros)
      dane_code: {
        type: DataTypes.STRING(3),
        allowNull: true,
        comment: 'Código DANE numérico del municipio (3 dígitos). Requerido para reportes DIAN.'
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    },
    {
      tableName: 'cities',
      schema: database.schema,
      timestamps: true
    }
  ) as defineCity.Static;

  City.associate = models => {
    City.belongsTo(models.Department, {
      foreignKey: 'department_id',
      as: 'department',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });
  };

  return City;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineCity {
  /** Columnas de cities. */
  export interface Attributes {
    city_id: string;
    name: string;
    department_id: string;
    /** Código DANE numérico del municipio (3 dígitos). Requerido para reportes DIAN. */
    dane_code: string | null;
    is_active: boolean | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'city_id' | 'dane_code' | 'is_active' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → Department (solo si viene en el include) */
    department?: defineDepartment.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default defineCity;
