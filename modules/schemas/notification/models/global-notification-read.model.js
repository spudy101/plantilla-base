const { DataTypes } = require('sequelize');
const { database } = require('../../../../shared/constants');

module.exports = sequelize => {
  const GlobalNotificationRead = sequelize.define(
    'GlobalNotificationRead',
    {
      global_notification_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false
      },

      user_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false
      },

      read_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },

      // Trazabilidad de sesión: ata la fila a user_sessions / audit_logs.session_id.
      // Se fotografía al CREAR; null en creaciones de worker/sistema.
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
      tableName: 'global_notification_reads',
      schema: database.schema,
      timestamps: false
    }
  );

  GlobalNotificationRead.associate = models => {
    GlobalNotificationRead.belongsTo(models.GlobalNotification, {
      foreignKey: 'global_notification_id',
      as: 'global_notification',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    GlobalNotificationRead.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  };

  return GlobalNotificationRead;
};
