import sequelizeModule = require('sequelize');
const { DataTypes } = sequelizeModule;
import constantsModule = require('../../../../../shared/constants');
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineUserConsent = require('./user-consent.model');







function defineConsentType(sequelize: Sequelize): defineConsentType.Static {
  const ConsentType = sequelize.define<defineConsentType.Instance>(
    'ConsentType',
    {
      consent_type_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      is_mandatory: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      is_revocable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      scope: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'ONBOARDING'
      }
    },
    {
      tableName: 'consent_types',
      schema: database.schema,
      timestamps: true,
      underscored: true
    }
  ) as defineConsentType.Static;

  ConsentType.associate = models => {
    ConsentType.hasMany(models.UserConsent, {
      foreignKey: 'consent_type_id',
      as: 'userConsents'
    });
  };

  return ConsentType;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineConsentType {
  /** Columnas de consent_types. */
  export interface Attributes {
    consent_type_id: string;
    code: string;
    name: string;
    description: string | null;
    is_mandatory: boolean;
    is_revocable: boolean;
    is_active: boolean;
    scope: string;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'consent_type_id' | 'description' | 'is_mandatory' | 'is_revocable' | 'is_active' | 'scope' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** HasMany → UserConsent (solo si viene en el include) */
    userConsents?: defineUserConsent.Instance[];
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export = defineConsentType;
