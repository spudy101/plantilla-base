import { DataTypes } from 'sequelize';
import constantsModule from '../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../shared/models/registry';
import type defineGlobalNotification from './global-notification.model';
import type defineNotification from './notification.model';
import type defineNotificationCategory from './notification-category.model';

function defineNotificationType(sequelize: Sequelize): defineNotificationType.Static {
  const NotificationType = sequelize.define<defineNotificationType.Instance>(
    'NotificationType',
    {
      notification_type_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      code: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
      },

      // Categoría (grupo) a la que pertenece el tipo. La categoría es la fuente de verdad de los
      // canales (email/sms/push), del DND y del layout base de email.
      notification_category_id: {
        type: DataTypes.UUID,
        allowNull: true
      },

      name: {
        type: DataTypes.STRING(200),
        allowNull: false
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      priority: {
        type: DataTypes.STRING(20),
        defaultValue: 'normal'
      },

      title_template: {
        type: DataTypes.TEXT,
        allowNull: false
      },

      body_template: {
        type: DataTypes.TEXT,
        allowNull: false
      },

      email_subject_template: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      email_body_template: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    },
    {
      tableName: 'notification_types',
      schema: database.schema,
      timestamps: true
    }
  ) as defineNotificationType.Static;

  NotificationType.associate = models => {
    NotificationType.belongsTo(models.NotificationCategory, {
      foreignKey: 'notification_category_id',
      as: 'category',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    NotificationType.hasMany(models.Notification, {
      foreignKey: 'notification_type_id',
      as: 'notifications',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    NotificationType.hasMany(models.GlobalNotification, {
      foreignKey: 'notification_type_id',
      as: 'global_notifications',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  };

  return NotificationType;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineNotificationType {
  /** Columnas de notification_types. */
  export interface Attributes {
    notification_type_id: string;
    code: string;
    notification_category_id: string | null;
    name: string;
    description: string | null;
    priority: string | null;
    title_template: string;
    body_template: string;
    email_subject_template: string | null;
    email_body_template: string | null;
    is_active: boolean | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'notification_type_id' | 'notification_category_id' | 'description' | 'priority' | 'email_subject_template' | 'email_body_template' | 'is_active' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → NotificationCategory (solo si viene en el include) */
    category?: defineNotificationCategory.Instance | null;
    /** HasMany → Notification (solo si viene en el include) */
    notifications?: defineNotification.Instance[];
    /** HasMany → GlobalNotification (solo si viene en el include) */
    global_notifications?: defineGlobalNotification.Instance[];
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default defineNotificationType;
