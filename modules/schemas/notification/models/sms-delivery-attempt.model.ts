import sequelizeModule = require('sequelize');
const { DataTypes } = sequelizeModule;
import constantsModule = require('../../../../shared/constants');
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../shared/models/registry';
import type defineUser = require('../../kyc/iam/models/user.model');







// Registro de intentos de envío de SMS (OTP/transaccional) vía AWS SNS. Nunca persiste el número
// en claro (solo su hash HMAC). Alimenta el reintento y el conteo de impacto durante un fallback.
function defineSmsDeliveryAttempt(sequelize: Sequelize): defineSmsDeliveryAttempt.Static {
  const SmsDeliveryAttempt = sequelize.define<defineSmsDeliveryAttempt.Instance>(
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
  ) as defineSmsDeliveryAttempt.Static;

  SmsDeliveryAttempt.associate = models => {
    SmsDeliveryAttempt.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      constraints: false
    });
  };

  return SmsDeliveryAttempt;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineSmsDeliveryAttempt {
  /** Columnas de sms_delivery_attempts. */
  export interface Attributes {
    sms_attempt_id: string;
    user_id: string | null;
    /** HMAC-SHA256 del número — nunca en claro */
    phone_hash: string;
    provider: string;
    purpose: string;
    status: 'pending' | 'sent' | 'failed';
    retry_count: number;
    last_error: string | null;
    provider_message_id: string | null;
    sent_at: Date | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'sms_attempt_id' | 'user_id' | 'provider' | 'status' | 'retry_count' | 'last_error' | 'provider_message_id' | 'sent_at' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → User (solo si viene en el include) */
    user?: defineUser.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export = defineSmsDeliveryAttempt;
