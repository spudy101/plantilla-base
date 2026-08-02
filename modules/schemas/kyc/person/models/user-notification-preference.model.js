const { DataTypes } = require('sequelize');
const { database } = require('../../../../../shared/constants');

module.exports = sequelize => {
  const UserNotificationPreference = sequelize.define(
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
  );

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
};
