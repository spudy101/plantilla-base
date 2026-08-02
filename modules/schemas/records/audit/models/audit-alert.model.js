const { DataTypes } = require('sequelize');
const { database } = require('../../../../../shared/constants');

module.exports = sequelize => {
  const AuditAlert = sequelize.define(
    'AuditAlert',
    {
      alert_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      audit_log_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Referencia al audit_log origen. Sin FK — independencia regulatoria.'
      },
      action: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      category: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      risk: {
        type: DataTypes.ENUM('low', 'medium', 'high', 'critical', 'unknown'),
        allowNull: false,
        defaultValue: 'high'
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      entity_id: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      entity_type: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      acknowledged: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      acknowledged_by: {
        type: DataTypes.UUID,
        allowNull: true
      },
      acknowledged_at: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: 'audit_alerts',
      schema: database.schema,
      timestamps: true,
      updatedAt: false,
      paranoid: false,
      underscored: true
    }
  );

  AuditAlert.associate = models => {
    AuditAlert.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'actor',
      constraints: false
    });
    AuditAlert.belongsTo(models.User, {
      foreignKey: 'acknowledged_by',
      as: 'acknowledgedByUser',
      constraints: false
    });
  };

  return AuditAlert;
};
