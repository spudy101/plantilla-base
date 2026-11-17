import { DataTypes } from 'sequelize';
import constantsModule from '../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../shared/models/registry';
import type defineNotificationType from './notification-type.model';
import type defineUserNotificationPreference from '../../kyc/person/models/user-notification-preference.model';











// Categoría (grupo) de notificaciones — la capa que gestiona el admin y a la que apuntan las
// preferencias del usuario. Es la FUENTE DE VERDAD de los canales (email/sms/push), del "no molestar"
// (quiet hours / DND) y de la presentación base del email (email_layout_template con placeholder
// {{content}}). Cada NotificationType (evento) pertenece a una categoría y solo aporta su contenido.

function defineNotificationCategory(sequelize: Sequelize): defineNotificationCategory.Static {
  const NotificationCategory = sequelize.define<defineNotificationCategory.Instance>(
    'NotificationCategory',
    {
      notification_category_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      code: {
        type: DataTypes.STRING(100),
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

      // ── Canales soportados por la categoría (mandan sobre el envío) ──
      supports_push: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },

      supports_email: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },

      supports_sms: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },

      // ── No molestar (DND) ──
      // allow_dnd=false → el usuario NO puede silenciar esta categoría (se ignora su quiet hours).
      allow_dnd: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },

      // is_critical=true → emergencia: ignora quiet hours y no es silenciable por el usuario.
      is_critical: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },

      default_quiet_hours_start: {
        type: DataTypes.TIME,
        allowNull: true
      },

      default_quiet_hours_end: {
        type: DataTypes.TIME,
        allowNull: true
      },

      priority: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'normal'
      },

      // Layout HTML+CSS base del email. Debe contener el placeholder {{content}} donde se inyecta
      // el email_body_template (fragmento) del NotificationType. Si es null, el body del tipo se
      // envía tal cual (compatibilidad con los tipos cuyo body ya es un documento HTML completo).
      email_layout_template: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      }
    },
    {
      tableName: 'notification_categories',
      schema: database.schema,
      timestamps: true
    }
  ) as defineNotificationCategory.Static;

  NotificationCategory.associate = models => {
    NotificationCategory.hasMany(models.NotificationType, {
      foreignKey: 'notification_category_id',
      as: 'notification_types',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    NotificationCategory.hasMany(models.UserNotificationPreference, {
      foreignKey: 'notification_category_code',
      sourceKey: 'code',
      as: 'user_preferences',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  };

  return NotificationCategory;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineNotificationCategory {
  /** Columnas de notification_categories. */
  export interface Attributes {
    notification_category_id: string;
    code: string;
    name: string;
    description: string | null;
    supports_push: boolean;
    supports_email: boolean;
    supports_sms: boolean;
    allow_dnd: boolean;
    is_critical: boolean;
    default_quiet_hours_start: string | null;
    default_quiet_hours_end: string | null;
    priority: string;
    email_layout_template: string | null;
    sort_order: number;
    is_active: boolean;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'notification_category_id' | 'description' | 'supports_push' | 'supports_email' | 'supports_sms' | 'allow_dnd' | 'is_critical' | 'default_quiet_hours_start' | 'default_quiet_hours_end' | 'priority' | 'email_layout_template' | 'sort_order' | 'is_active' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** HasMany → NotificationType (solo si viene en el include) */
    notification_types?: defineNotificationType.Instance[];
    /** HasMany → UserNotificationPreference (solo si viene en el include) */
    user_preferences?: defineUserNotificationPreference.Instance[];
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default defineNotificationCategory;
