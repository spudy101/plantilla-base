const { DataTypes } = require('sequelize');
const { database } = require('../../../../shared/constants');

module.exports = sequelize => {
  const Notification = sequelize.define(
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
  );

  Notification.PROCESSING_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    PARTIAL_FAILURE: 'partial_failure',
    FAILED: 'failed'
  };

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
};
