import { DataTypes } from 'sequelize';
import domainEnumsModule from '../../../../shared/constants/domain-enums';
const { NOTIFICATION_PROCESSING_STATUS } = domainEnumsModule;
import constantsModule from '../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../shared/models/registry';
import type defineNotificationType from './notification-type.model';
import type defineUser from '../../kyc/iam/models/user.model';

function defineNotification(sequelize: Sequelize): defineNotification.Static {
  const Notification = sequelize.define<defineNotification.Instance>(
    'Notification',
    {
      notification_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      user_id: {
        type: DataTypes.UUID,
        allowNull: false
      },

      notification_type_id: {
        type: DataTypes.UUID,
        allowNull: true
      },

      title: {
        type: DataTypes.TEXT,
        allowNull: false
      },

      body: {
        type: DataTypes.TEXT,
        allowNull: false
      },

      related_entity_type: {
        type: DataTypes.STRING(50),
        allowNull: true
      },

      related_entity_id: {
        type: DataTypes.UUID,
        allowNull: true
      },

      metadata: {
        type: DataTypes.JSONB,
        allowNull: true
      },

      is_read: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },

      read_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      push_sent: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },

      push_sent_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      push_error: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      push_retry_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },

      push_next_retry_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      email_sent: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },

      email_sent_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      email_error: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      email_retry_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },

      email_next_retry_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      sms_sent: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },

      sms_sent_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      sms_error: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      sms_retry_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },

      sms_next_retry_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      scheduled_for: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Para quiet_hours - cuándo debe enviarse'
      },

      priority: {
        type: DataTypes.INTEGER,
        defaultValue: 5,
        comment: '1-10, para ordenar cola de envíos'
      },

      processing_status: {
        type: DataTypes.STRING(20),
        defaultValue: 'pending',
        comment: 'pending, processing, completed, partial_failure, failed'
      },

      retry_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Número de reintentos de entrega realizados por el notification worker'
      }
    },
    {
      tableName: 'notifications',
      schema: database.schema,
      timestamps: true
    }
  ) as defineNotification.Static;

  Notification.PROCESSING_STATUS = NOTIFICATION_PROCESSING_STATUS;

  Notification.associate = models => {
    Notification.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    Notification.belongsTo(models.NotificationType, {
      foreignKey: 'notification_type_id',
      as: 'notification_type',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  };

  return Notification;
}


// Extensiones manuales (no generadas): se fusionan con los tipos de abajo.
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineNotification {
  export interface StaticExtensions {
    PROCESSING_STATUS: typeof NOTIFICATION_PROCESSING_STATUS;
  }
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineNotification {
  /** Columnas de notifications. */
  export interface Attributes {
    notification_id: string;
    user_id: string;
    notification_type_id: string | null;
    title: string;
    body: string;
    related_entity_type: string | null;
    related_entity_id: string | null;
    metadata: unknown;
    is_read: boolean | null;
    read_at: Date | null;
    push_sent: boolean | null;
    push_sent_at: Date | null;
    push_error: string | null;
    push_retry_count: number | null;
    push_next_retry_at: Date | null;
    email_sent: boolean | null;
    email_sent_at: Date | null;
    email_error: string | null;
    email_retry_count: number | null;
    email_next_retry_at: Date | null;
    sms_sent: boolean | null;
    sms_sent_at: Date | null;
    sms_error: string | null;
    sms_retry_count: number | null;
    sms_next_retry_at: Date | null;
    /** Para quiet_hours - cuándo debe enviarse */
    scheduled_for: Date | null;
    /** 1-10, para ordenar cola de envíos */
    priority: number | null;
    /** pending, processing, completed, partial_failure, failed */
    processing_status: string | null;
    /** Número de reintentos de entrega realizados por el notification worker */
    retry_count: number;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'notification_id' | 'notification_type_id' | 'related_entity_type' | 'related_entity_id' | 'metadata' | 'is_read' | 'read_at' | 'push_sent' | 'push_sent_at' | 'push_error' | 'push_retry_count' | 'push_next_retry_at' | 'email_sent' | 'email_sent_at' | 'email_error' | 'email_retry_count' | 'email_next_retry_at' | 'sms_sent' | 'sms_sent_at' | 'sms_error' | 'sms_retry_count' | 'sms_next_retry_at' | 'scheduled_for' | 'priority' | 'processing_status' | 'retry_count' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → User (solo si viene en el include) */
    user?: defineUser.Instance | null;
    /** BelongsTo → NotificationType (solo si viene en el include) */
    notification_type?: defineNotificationType.Instance | null;
  }

  export type Static = ModelStatic<Instance> & StaticExtensions & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default defineNotification;
