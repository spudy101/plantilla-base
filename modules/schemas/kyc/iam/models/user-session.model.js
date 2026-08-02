const { DataTypes } = require('sequelize');
const { database } = require('../../../../../shared/constants');

module.exports = sequelize => {
  const UserSession = sequelize.define(
    'UserSession',
    {
      user_session_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      device_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      jti: {
        type: DataTypes.STRING(36),
        allowNull: false,
        unique: true
      },
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true
      },
      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('active', 'closed'),
        allowNull: false,
        defaultValue: 'active'
      },
      started_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      last_access_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      closed_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      close_reason: {
        type: DataTypes.STRING(50),
        allowNull: true
      }
    },
    {
      tableName: 'user_sessions',
      schema: database.schema,
      timestamps: true,
      underscored: true
    }
  );

  UserSession.STATUS = {
    ACTIVE: 'active',
    CLOSED: 'closed'
  };

  UserSession.associate = models => {
    UserSession.belongsTo(models.UserTrustedDevice, {
      foreignKey: 'device_id',
      as: 'device'
    });
    UserSession.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'sessionUser',
      constraints: false
    });
  };

  return UserSession;
};
