import { DataTypes } from 'sequelize';
import constantsModule from '../../../../shared/constants';
const { database } = constantsModule;
import originSessionMixinModule from '../../../../shared/models/mixins/origin-session.mixin';
const { originSessionModelFields } = originSessionMixinModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../shared/models/registry';
import type defineUser from '../../kyc/iam/models/user.model';

function defineUserPushToken(sequelize: Sequelize): defineUserPushToken.Static {
  const UserPushToken = sequelize.define<defineUserPushToken.Instance>(
    'UserPushToken',
    {
      user_push_token_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      user_id: {
        type: DataTypes.UUID,
        allowNull: false
      },

      token: {
        type: DataTypes.TEXT,
        allowNull: false
      },

      platform: {
        type: DataTypes.STRING(20),
        allowNull: false
      },

      device_id: {
        type: DataTypes.STRING(255),
        allowNull: true
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },

      last_used_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },

      // Trazabilidad de sesión: qué sesión del cliente registró este token/dispositivo push.
      ...originSessionModelFields()
    },
    {
      tableName: 'user_push_tokens',
      schema: database.schema,
      timestamps: true
    }
  ) as defineUserPushToken.Static;

  UserPushToken.associate = models => {
    UserPushToken.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  };

  return UserPushToken;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineUserPushToken {
  /** Columnas de user_push_tokens. */
  export interface Attributes {
    user_push_token_id: string;
    user_id: string;
    token: string;
    platform: string;
    device_id: string | null;
    is_active: boolean | null;
    last_used_at: Date | null;
    origin_session_id: string | null;
    origin_correlation_id: string | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'user_push_token_id' | 'device_id' | 'is_active' | 'last_used_at' | 'origin_session_id' | 'origin_correlation_id' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → User (solo si viene en el include) */
    user?: defineUser.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default defineUserPushToken;
