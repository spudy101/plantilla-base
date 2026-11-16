import sequelizeModule = require('sequelize');
const { DataTypes } = sequelizeModule;
import constantsModule = require('../../../../../shared/constants');
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineAvatar = require('./avatar.model');







function defineAvatarTheme(sequelize: Sequelize): defineAvatarTheme.Static {
  const AvatarTheme = sequelize.define<defineAvatarTheme.Instance>(
    'AvatarTheme',
    {
      avatar_theme_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    },
    {
      tableName: 'avatar_themes',
      schema: database.schema,
      timestamps: true
    }
  ) as defineAvatarTheme.Static;

  AvatarTheme.associate = models => {
    AvatarTheme.hasMany(models.Avatar, {
      foreignKey: 'avatar_theme_id',
      as: 'avatars'
    });
  };

  return AvatarTheme;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineAvatarTheme {
  /** Columnas de avatar_themes. */
  export interface Attributes {
    avatar_theme_id: string;
    name: string;
    is_active: boolean | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'avatar_theme_id' | 'is_active' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** HasMany → Avatar (solo si viene en el include) */
    avatars?: defineAvatar.Instance[];
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export = defineAvatarTheme;
