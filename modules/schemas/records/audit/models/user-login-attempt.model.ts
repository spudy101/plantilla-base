import { DataTypes } from 'sequelize';
import EncryptionUtil from '../../../../../shared/utils/encryption.util';
import constantsModule from '../../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineUser from '../../../kyc/iam/models/user.model';

function defineUserLoginAttempt(sequelize: Sequelize): defineUserLoginAttempt.Static {
  const UserLoginAttempt = sequelize.define<defineUserLoginAttempt.Instance>(
    'UserLoginAttempt',
    {
      user_login_attempt_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Null if user not found'
      },

      username_attempt: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Username or email attempted'
      },

      national_id: {
        type: DataTypes.STRING(255),
        allowNull: false
      },

      national_id_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: 'HMAC-SHA256(national_id, HASH_PEPPER) — solo para búsquedas WHERE'
      },

      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: 'IPv4 or IPv6'
      },

      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      device_fingerprint: {
        type: DataTypes.STRING(255),
        allowNull: true
      },

      success: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },

      failure_reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Invalid credentials, account locked, etc.'
      },

      blocked_until: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When the account/IP will be unblocked'
      },

      attempted_at: {
        type: DataTypes.DATE,
        allowNull: false
      },

      // Trazabilidad de sesión. Null en intentos fallidos (la sesión nunca existió); con valor en los
      // exitosos, donde el sessionId se pasa explícito.
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
      tableName: 'user_login_attempts',
      schema: database.schema,
      timestamps: true,
      hooks: {
        // Descifrar national_id al leer — se cifra en el repositorio con AES-256-GCM
        afterFind: result => {
          if (!result) {
            return;
          }
          const decrypt = (record: defineUserLoginAttempt.Instance | null | undefined) => {
            if (!record) {
              return;
            }
            if (record.national_id) {
              try {
                record.national_id = EncryptionUtil.decrypt(record.national_id);
              } catch {
                /* dato no cifrado (legacy) */
              }
            }
          };
          // Array.isArray no estrecha el readonly Instance[] que entrega el hook
          (Array.isArray(result) ? (result as readonly defineUserLoginAttempt.Instance[]) : [result as defineUserLoginAttempt.Instance]).forEach(decrypt);
        }
      }
    }
  ) as defineUserLoginAttempt.Static;

  UserLoginAttempt.associate = models => {
    UserLoginAttempt.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  };

  return UserLoginAttempt;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineUserLoginAttempt {
  /** Columnas de user_login_attempts. */
  export interface Attributes {
    user_login_attempt_id: string;
    /** Null if user not found */
    user_id: string | null;
    /** Username or email attempted */
    username_attempt: string;
    national_id: string;
    /** HMAC-SHA256(national_id, HASH_PEPPER) — solo para búsquedas WHERE */
    national_id_hash: string | null;
    /** IPv4 or IPv6 */
    ip_address: string | null;
    user_agent: string | null;
    device_fingerprint: string | null;
    success: boolean;
    /** Invalid credentials, account locked, etc. */
    failure_reason: string | null;
    /** When the account/IP will be unblocked */
    blocked_until: Date | null;
    attempted_at: Date;
    origin_session_id: string | null;
    origin_correlation_id: string | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'user_login_attempt_id' | 'user_id' | 'national_id_hash' | 'ip_address' | 'user_agent' | 'device_fingerprint' | 'success' | 'failure_reason' | 'blocked_until' | 'origin_session_id' | 'origin_correlation_id' | 'createdAt' | 'updatedAt'>;

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

export default defineUserLoginAttempt;
