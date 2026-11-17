import { DataTypes } from 'sequelize';
import constantsModule from '../../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineUser from './user.model';

// Challenge de un solo uso para registro/login biométrico.
function defineBiometricChallenge(sequelize: Sequelize): defineBiometricChallenge.Static {
  const BiometricChallenge = sequelize.define<defineBiometricChallenge.Instance>(
    'BiometricChallenge',
    {
      challenge_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      challenge: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      type: {
        type: DataTypes.STRING(20),
        allowNull: false
      },
      used: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false
      }
    },
    {
      tableName: 'biometric_challenges',
      schema: database.schema,
      timestamps: true,
      updatedAt: false // la tabla solo tiene created_at
    }
  ) as defineBiometricChallenge.Static;

  BiometricChallenge.associate = models => {
    BiometricChallenge.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
  };

  return BiometricChallenge;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineBiometricChallenge {
  /** Columnas de biometric_challenges. */
  export interface Attributes {
    challenge_id: string;
    user_id: string | null;
    challenge: string;
    type: string;
    used: boolean;
    expires_at: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'challenge_id' | 'user_id' | 'used' | 'createdAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** BelongsTo → User (solo si viene en el include) */
    user?: defineUser.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default defineBiometricChallenge;
