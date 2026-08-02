const { DataTypes } = require('sequelize');
const { database } = require('../../../../shared/constants');

module.exports = sequelize => {
  const VerificationCode = sequelize.define(
    'VerificationCode',
    {
      verification_code_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      type: {
        // 'contract_signature' → OTP de la firma electrónica de contingencia 2FA (REQ-09 BUILD 1).
        type: DataTypes.ENUM('email', 'phone', 'contract_signature'),
        allowNull: false
      },

      contact_value: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Email address or phone number'
      },

      code: {
        type: DataTypes.STRING(10),
        allowNull: false
      },

      attempts: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },

      expires_at: {
        type: DataTypes.DATE,
        allowNull: false
      },

      verified_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      // Trazabilidad de sesión. Mixto: null en OTP de onboarding y challenge SMS de login (rutas
      // públicas); con valor al activar MFA y al firmar contrato.
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
      tableName: 'verification_codes',
      schema: database.schema,
      timestamps: true
    }
  );

  return VerificationCode;
};
