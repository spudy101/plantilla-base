const { DataTypes } = require('sequelize');
const { database } = require('../../../../shared/constants');

// Suppression list de correo por dirección (HMAC). Al acumular 3 rebotes duros (hard bounces) la
// dirección pasa a 'suppressed' y todo envío futuro se salta, protegiendo la reputación de envío de
// SES. Nunca persiste el correo en claro (solo email_hash).
module.exports = sequelize => {
  const EmailBounceSuppression = sequelize.define(
    'EmailBounceSuppression',
    {
      email_bounce_suppression_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      email_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        comment: 'Hash SHA-256 de la dirección normalizada — nunca el correo en claro'
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      bounce_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      status: {
        type: DataTypes.ENUM('active', 'suppressed'),
        allowNull: false,
        defaultValue: 'active'
      },
      last_error_code: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      last_bounce_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      suppressed_at: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: 'email_bounce_suppressions',
      schema: database.schema,
      timestamps: true,
      underscored: true
    }
  );

  EmailBounceSuppression.associate = models => {
    EmailBounceSuppression.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      constraints: false
    });
  };

  return EmailBounceSuppression;
};
