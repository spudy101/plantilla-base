import { DataTypes } from 'sequelize';
import constantsModule from '../../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineAvatarTheme from './avatar-theme.model';

function defineAvatar(sequelize: Sequelize): defineAvatar.Static {
  const Avatar = sequelize.define<defineAvatar.Instance>(
    'Avatar',
    {
      avatar_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      name: {
        type: DataTypes.STRING(100),
        allowNull: false
      },

      avatar_theme_id: {
        type: DataTypes.UUID,
        allowNull: false
      },

      image_url: {
        type: DataTypes.STRING(255),
        allowNull: true
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    },
    {
      tableName: 'avatars',
      schema: database.schema,
      timestamps: true
    }
  ) as defineAvatar.Static;

  Avatar.associate = models => {
    Avatar.belongsTo(models.AvatarTheme, {
      foreignKey: 'avatar_theme_id',
      as: 'theme',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });
  };

  return Avatar;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineAvatar {
  /** Columnas de avatars. */
  export interface Attributes {
    avatar_id: string;
    name: string;
    avatar_theme_id: string;
    image_url: string | null;
    is_active: boolean | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'avatar_id' | 'image_url' | 'is_active' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → AvatarTheme (solo si viene en el include) */
    theme?: defineAvatarTheme.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default defineAvatar;
