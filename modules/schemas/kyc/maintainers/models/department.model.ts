import sequelizeModule = require('sequelize');
const { DataTypes } = sequelizeModule;
import constantsModule = require('../../../../../shared/constants');
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineCountry = require('./country.model');







function defineDepartment(sequelize: Sequelize): defineDepartment.Static {
  const Department = sequelize.define<defineDepartment.Instance>(
    'Department',
    {
      department_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      country_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      // Código DANE numérico 2 dígitos (ej: '05' = Antioquia, '11' = Bogotá D.C.)
      // Requerido para reportes DIAN (Formato 1026 y otros)
      dane_code: {
        type: DataTypes.STRING(2),
        allowNull: true,
        comment: 'Código DANE numérico del departamento (2 dígitos). Requerido para reportes DIAN.'
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    },
    {
      tableName: 'departments',
      schema: database.schema,
      timestamps: true
    }
  ) as defineDepartment.Static;

  Department.associate = models => {
    Department.belongsTo(models.Country, {
      foreignKey: 'country_id',
      as: 'country',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });
  };

  return Department;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineDepartment {
  /** Columnas de departments. */
  export interface Attributes {
    department_id: string;
    name: string;
    country_id: string;
    /** Código DANE numérico del departamento (2 dígitos). Requerido para reportes DIAN. */
    dane_code: string | null;
    is_active: boolean | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'department_id' | 'dane_code' | 'is_active' | 'createdAt' | 'updatedAt'>;

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

export = defineDepartment;
