import sequelizeModule = require('sequelize');
const { DataTypes } = sequelizeModule;
import constantsModule = require('../../../../../shared/constants');
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineNotificationCategory = require('../../../notification/models/notification-category.model');
import type defineUser = require('../../iam/models/user.model');







function defineUserNotificationPreference(sequelize: Sequelize): defineUserNotificationPreference.Static {
  const UserNotificationPreference = sequelize.define<defineUserNotificationPreference.Instance>(
    'UserNotificationPreference',
    {
      user_notification_preference_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      user_id: {
        type: DataTypes.UUID,
        allowNull: false
      },

      // Categoría a la que aplica la preferencia. null = preferencia GLOBAL (afecta a todas las
      // categorías del usuario). Resolución en envío: preferencia de la categoría → global.
      notification_category_code: {
        type: DataTypes.STRING(100),
        allowNull: true
      },

      allow_push: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },

      allow_email: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },

      allow_sms: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },

      quiet_hours_start: {
        type: DataTypes.TIME,
        allowNull: true
      },

      quiet_hours_end: {
        type: DataTypes.TIME,
        allowNull: true
      },

      // Trazabilidad de sesión. Mixto: null cuando la fila nace en el registro (ruta pública), con
      // valor cuando el usuario cambia sus preferencias ya autenticado.
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
      tableName: 'user_notification_preferences',
      schema: database.schema,
      timestamps: true
    }
  ) as defineUserNotificationPreference.Static;

  UserNotificationPreference.associate = models => {
    UserNotificationPreference.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    UserNotificationPreference.belongsTo(models.NotificationCategory, {
      foreignKey: 'notification_category_code',
      targetKey: 'code',
      as: 'notification_category',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  };

  return UserNotificationPreference;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineUserNotificationPreference {
  /** Columnas de user_notification_preferences. */
  export interface Attributes {
    user_notification_preference_id: string;
    user_id: string;
    notification_category_code: string | null;
    allow_push: boolean | null;
    allow_email: boolean | null;
    allow_sms: boolean | null;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    origin_session_id: string | null;
    origin_correlation_id: string | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'user_notification_preference_id' | 'notification_category_code' | 'allow_push' | 'allow_email' | 'allow_sms' | 'quiet_hours_start' | 'quiet_hours_end' | 'origin_session_id' | 'origin_correlation_id' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → User (solo si viene en el include) */
    user?: defineUser.Instance | null;
    /** BelongsTo → NotificationCategory (solo si viene en el include) */
    notification_category?: defineNotificationCategory.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export = defineUserNotificationPreference;
