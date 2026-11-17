import { DataTypes } from 'sequelize';
import constantsModule from '../../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineUser from './user.model';
import type defineUserTrustedDevice from './user-trusted-device.model';

// Credencial biométrica (llave pública ES256) registrada para un dispositivo de confianza.
function defineUserBiometricCredential(sequelize: Sequelize): defineUserBiometricCredential.Static {
  const UserBiometricCredential = sequelize.define<defineUserBiometricCredential.Instance>(
    'UserBiometricCredential',
    {
      biometric_credential_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      user_trusted_device_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      credential_id: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      public_key: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      sign_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      last_used_at: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: 'user_biometric_credentials',
      schema: database.schema,
      timestamps: true
    }
  ) as defineUserBiometricCredential.Static;

  UserBiometricCredential.associate = models => {
    UserBiometricCredential.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
    UserBiometricCredential.belongsTo(models.UserTrustedDevice, {
      foreignKey: 'user_trusted_device_id',
      as: 'trustedDevice'
    });
  };

  return UserBiometricCredential;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineUserBiometricCredential {
  /** Columnas de user_biometric_credentials. */
  export interface Attributes {
    biometric_credential_id: string;
    user_id: string;
    user_trusted_device_id: string;
    credential_id: string;
    public_key: string;
    sign_count: number;
    is_active: boolean;
    last_used_at: Date | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'biometric_credential_id' | 'sign_count' | 'is_active' | 'last_used_at' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → User (solo si viene en el include) */
    user?: defineUser.Instance | null;
    /** BelongsTo → UserTrustedDevice (solo si viene en el include) */
    trustedDevice?: defineUserTrustedDevice.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default defineUserBiometricCredential;
