import sequelizeModule = require('sequelize');
const { DataTypes } = sequelizeModule;
import constantsModule = require('../../../../shared/constants');
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../shared/models/registry';







function defineVerificationCode(sequelize: Sequelize): defineVerificationCode.Static {
  const VerificationCode = sequelize.define<defineVerificationCode.Instance>(
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
  ) as defineVerificationCode.Static;

  return VerificationCode;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineVerificationCode {
  /** Columnas de verification_codes. */
  export interface Attributes {
    verification_code_id: string;
    type: 'email' | 'phone' | 'contract_signature';
    /** Email address or phone number */
    contact_value: string;
    code: string;
    attempts: number | null;
    expires_at: Date;
    verified_at: Date | null;
    origin_session_id: string | null;
    origin_correlation_id: string | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'verification_code_id' | 'attempts' | 'verified_at' | 'origin_session_id' | 'origin_correlation_id' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export = defineVerificationCode;
