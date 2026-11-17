// === RF-AUTH-02: Login, Gestión de Sesión Segura y Recuperación de Contraseña ===

import { DataTypes } from 'sequelize';
import constantsModule from '../../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineUser from './user.model';

function defineResetCredentials(sequelize: Sequelize): defineResetCredentials.Static {
  // [RF-AUTH-02] | CA-03 | Tabla reset_credentials: token único, expires_at, used/used_at para enlace de un solo uso
  const ResetCredentials = sequelize.define<defineResetCredentials.Instance>(
    'ResetCredentials',
    {
      reset_credentials_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'Usuario asociado al token de reseteo'
      },

      token: {
        type: DataTypes.STRING(500),
        allowNull: false,
        unique: true,
        comment: 'Token único para resetear credenciales (URL segura)'
      },

      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
          isEmail: {
            msg: 'Email debe ser válido'
          }
        },
        comment: 'Email del usuario al momento de solicitar el reseteo'
      },

      type: {
        type: DataTypes.ENUM('mfa', 'password'),
        allowNull: false,
        validate: {
          isIn: {
            args: [['mfa', 'password']],
            msg: 'Tipo debe ser "mfa" o "password"'
          }
        },
        comment: 'Tipo de reseteo: mfa (recuperación MFA) o password (cambio contraseña)'
      },

      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Fecha de expiración del token'
      },

      used: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'Indica si el token ya fue utilizado'
      },

      used_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Fecha en la que se utilizó el token'
      },

      // Trazabilidad de sesión. Flujo NO autenticado ("olvidé mi contraseña") → origin_session_id
      // null por diseño; el correlationId ata la fila al request.
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
      tableName: 'reset_credentials',
      schema: database.schema,
      timestamps: true,
      paranoid: false
    }
  ) as defineResetCredentials.Static;

  ResetCredentials.associate = models => {
    ResetCredentials.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  };

  return ResetCredentials;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineResetCredentials {
  /** Columnas de reset_credentials. */
  export interface Attributes {
    reset_credentials_id: string;
    /** Usuario asociado al token de reseteo */
    user_id: string;
    /** Token único para resetear credenciales (URL segura) */
    token: string;
    /** Email del usuario al momento de solicitar el reseteo */
    email: string;
    /** Tipo de reseteo: mfa (recuperación MFA) o password (cambio contraseña) */
    type: 'mfa' | 'password';
    /** Fecha de expiración del token */
    expires_at: Date;
    /** Indica si el token ya fue utilizado */
    used: boolean | null;
    /** Fecha en la que se utilizó el token */
    used_at: Date | null;
    origin_session_id: string | null;
    origin_correlation_id: string | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'reset_credentials_id' | 'used' | 'used_at' | 'origin_session_id' | 'origin_correlation_id' | 'createdAt' | 'updatedAt'>;

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

export default defineResetCredentials;
