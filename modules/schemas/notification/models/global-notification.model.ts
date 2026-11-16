import sequelizeModule = require('sequelize');
const { DataTypes } = sequelizeModule;
import constantsModule = require('../../../../shared/constants');
const { database } = constantsModule;
import originSessionMixinModule = require('../../../../shared/models/mixins/origin-session.mixin');
const { originSessionModelFields } = originSessionMixinModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../shared/models/registry';
import type defineNotificationType = require('./notification-type.model');
import type defineUser = require('../../kyc/iam/models/user.model');







function defineGlobalNotification(sequelize: Sequelize): defineGlobalNotification.Static {
  const GlobalNotification = sequelize.define<defineGlobalNotification.Instance>(
    'GlobalNotification',
    {
      global_notification_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
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

      metadata: {
        type: DataTypes.JSONB,
        allowNull: true
      },

      send_push: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },

      send_email: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },

      send_in_app: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },

      push_processing_status: {
        type: DataTypes.STRING(20),
        defaultValue: 'pending'
      },

      email_processing_status: {
        type: DataTypes.STRING(20),
        defaultValue: 'pending'
      },

      push_sent_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },

      email_sent_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },

      starts_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },

      ends_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      target_user_role: {
        type: DataTypes.STRING(50),
        allowNull: true
      },

      target_conditions: {
        type: DataTypes.JSONB,
        allowNull: true
      },

      created_by: {
        type: DataTypes.UUID,
        allowNull: true
      },

      batch_size: {
        type: DataTypes.INTEGER,
        defaultValue: 100,
        comment: 'Usuarios por lote para AWS SES/SNS'
      },

      processing_started_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Cuándo empezó el procesamiento'
      },

      processing_completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Cuándo terminó el procesamiento'
      },

      total_target_users: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'Cantidad total de usuarios elegibles'
      },

      // Trazabilidad de sesión: qué sesión de admin creó esta notificación global.
      ...originSessionModelFields()
    },
    {
      tableName: 'global_notifications',
      schema: database.schema,
      timestamps: true
    }
  ) as defineGlobalNotification.Static;

  GlobalNotification.associate = models => {
    GlobalNotification.belongsTo(models.NotificationType, {
      foreignKey: 'notification_type_id',
      as: 'notification_type',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    GlobalNotification.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    GlobalNotification.belongsToMany(models.User, {
      through: models.GlobalNotificationRead,
      foreignKey: 'global_notification_id',
      otherKey: 'user_id',
      as: 'readers',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  };

  return GlobalNotification;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineGlobalNotification {
  /** Columnas de global_notifications. */
  export interface Attributes {
    global_notification_id: string;
    notification_type_id: string | null;
    title: string;
    body: string;
    metadata: unknown;
    send_push: boolean | null;
    send_email: boolean | null;
    send_in_app: boolean | null;
    push_processing_status: string | null;
    email_processing_status: string | null;
    push_sent_count: number | null;
    email_sent_count: number | null;
    is_active: boolean | null;
    starts_at: Date | null;
    ends_at: Date | null;
    target_user_role: string | null;
    target_conditions: unknown;
    created_by: string | null;
    /** Usuarios por lote para AWS SES/SNS */
    batch_size: number | null;
    /** Cuándo empezó el procesamiento */
    processing_started_at: Date | null;
    /** Cuándo terminó el procesamiento */
    processing_completed_at: Date | null;
    /** Cantidad total de usuarios elegibles */
    total_target_users: number | null;
    origin_session_id: string | null;
    origin_correlation_id: string | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'global_notification_id' | 'notification_type_id' | 'metadata' | 'send_push' | 'send_email' | 'send_in_app' | 'push_processing_status' | 'email_processing_status' | 'push_sent_count' | 'email_sent_count' | 'is_active' | 'starts_at' | 'ends_at' | 'target_user_role' | 'target_conditions' | 'created_by' | 'batch_size' | 'processing_started_at' | 'processing_completed_at' | 'total_target_users' | 'origin_session_id' | 'origin_correlation_id' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → NotificationType (solo si viene en el include) */
    notification_type?: defineNotificationType.Instance | null;
    /** BelongsTo → User (solo si viene en el include) */
    creator?: defineUser.Instance | null;
    /** BelongsToMany → User (solo si viene en el include) */
    readers?: defineUser.Instance[];
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export = defineGlobalNotification;
