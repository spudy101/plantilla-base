const { DataTypes } = require('sequelize');
const { database } = require('../../../../shared/constants');

// Registro de intentos de envío de SMS (OTP/transaccional) vía AWS SNS. Nunca persiste el número
// en claro (solo su hash HMAC). Alimenta el reintento y el conteo de impacto durante un fallback.
module.exports = sequelize => {
  const SmsDeliveryAttempt = sequelize.define(
    'SmsDeliveryAttempt',
    {
      sms_attempt_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      phone_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: 'HMAC-SHA256 del número — nunca en claro'
      },
      provider: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'aws_sms'
      },
      purpose: {
        type: DataTypes.STRING(30),
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM('pending', 'sent', 'failed'),
        allowNull: false,
        defaultValue: 'pending'
      },
      retry_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      last_error: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      provider_message_id: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      sent_at: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: 'sms_delivery_attempts',
      schema: database.schema,
      timestamps: true,
      underscored: true
    }
  );

  SmsDeliveryAttempt.associate = models => {
    SmsDeliveryAttempt.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      constraints: false
    });
  };

  return SmsDeliveryAttempt;
};
