const { DataTypes } = require('sequelize');
const { database } = require('../../../../shared/constants');

module.exports = sequelize => {
  const NotificationType = sequelize.define(
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
  );

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
};
