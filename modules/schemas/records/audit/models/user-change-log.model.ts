import { DataTypes } from 'sequelize';
import constantsModule from '../../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineUser from '../../../kyc/iam/models/user.model';

function defineUserChangeLog(sequelize: Sequelize): defineUserChangeLog.Static {
  const UserChangeLog = sequelize.define<defineUserChangeLog.Instance>(
    'UserChangeLog',
    {
      log_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'Usuario afectado por el cambio'
      },

      changed_by_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Usuario que realizó el cambio (null si fue el sistema)'
      },

      changed_by_role: {
        type: DataTypes.ENUM('admin', 'user', 'system'),
        allowNull: false,
        comment: 'Rol del que hizo el cambio'
      },

      change_type: {
        type: DataTypes.ENUM(
          'email',
          'password',
          'mfa_status',
          'account_status',
          'role',
          'national_id',
          'name',
          'gender',
          'location',
          'phone',
          'birth_date',
          'funds_origin',
          'sms_mfa_status',
          'preferred_mfa_method'
        ),
        allowNull: false,
        comment: 'Tipo de cambio realizado'
      },

      previous_value: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Valor anterior (null para password por seguridad)'
      },

      new_value: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Valor nuevo (null para password por seguridad)'
      },

      change_reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Razón del cambio (opcional)'
      },

      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: 'IP desde donde se hizo el cambio'
      },

      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Navegador/dispositivo usado'
      },

      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false
      },

      // Trazabilidad de sesión: ata la fila a user_sessions / audit_logs.session_id.
      // Se fotografía al CREAR; null en creaciones de worker/sistema.
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
      tableName: 'user_change_logs',
      schema: database.schema,
      timestamps: false, // Solo created_at manual
      underscored: true,
      indexes: [
        {
          name: 'idx_user_change_logs_user_id',
          fields: ['user_id']
        },
        {
          name: 'idx_user_change_logs_change_type',
          fields: ['change_type']
        },
        {
          name: 'idx_user_change_logs_created_at',
          fields: ['created_at']
        }
      ]
    }
  ) as defineUserChangeLog.Static;

  UserChangeLog.associate = models => {
    UserChangeLog.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    UserChangeLog.belongsTo(models.User, {
      foreignKey: 'changed_by_user_id',
      as: 'changedBy',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  };

  return UserChangeLog;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineUserChangeLog {
  /** Columnas de user_change_logs. */
  export interface Attributes {
    log_id: string;
    /** Usuario afectado por el cambio */
    user_id: string;
    /** Usuario que realizó el cambio (null si fue el sistema) */
    changed_by_user_id: string | null;
    /** Rol del que hizo el cambio */
    changed_by_role: 'admin' | 'user' | 'system';
    /** Tipo de cambio realizado */
    change_type: 'email' | 'password' | 'mfa_status' | 'account_status' | 'role' | 'national_id' | 'name' | 'gender' | 'location' | 'phone' | 'birth_date' | 'funds_origin' | 'sms_mfa_status' | 'preferred_mfa_method';
    /** Valor anterior (null para password por seguridad) */
    previous_value: string | null;
    /** Valor nuevo (null para password por seguridad) */
    new_value: string | null;
    /** Razón del cambio (opcional) */
    change_reason: string | null;
    /** IP desde donde se hizo el cambio */
    ip_address: string | null;
    /** Navegador/dispositivo usado */
    user_agent: string | null;
    created_at: Date;
    origin_session_id: string | null;
    origin_correlation_id: string | null;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'log_id' | 'changed_by_user_id' | 'previous_value' | 'new_value' | 'change_reason' | 'ip_address' | 'user_agent' | 'created_at' | 'origin_session_id' | 'origin_correlation_id'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** BelongsTo → User (solo si viene en el include) */
    user?: defineUser.Instance | null;
    /** BelongsTo → User (solo si viene en el include) */
    changedBy?: defineUser.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default defineUserChangeLog;
