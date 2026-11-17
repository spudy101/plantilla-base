import { DataTypes } from 'sequelize';
import constantsModule from '../../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineAvatar from '../../maintainers/models/avatar.model';
import type definePerson from '../../person/models/person.model';
import type defineRole from './role.model';
import type defineUserLoginAttempt from '../../../records/audit/models/user-login-attempt.model';
import type defineUserNotificationPreference from '../../person/models/user-notification-preference.model';
import type defineUserTrustedDevice from './user-trusted-device.model';

function defineUser(sequelize: Sequelize): defineUser.Static {
  const User = sequelize.define<defineUser.Instance>(
    'User',
    {
      user_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      username: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
      },

      password_hash: {
        type: DataTypes.STRING(255),
        // Todo usuario del sistema tiene password: el hash bcrypt local es la
        // única fuente de verdad de credenciales (ya no hay proveedor externo).
        allowNull: false,
        comment: 'Bcrypt hash of password'
      },

      auth_username: {
        type: DataTypes.STRING(255),
        allowNull: true,
        unique: true,
        comment: 'Handle interno estable del usuario (user_<uuid> / staff_<uuid>)'
      },

      person_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true
      },

      role_id: {
        type: DataTypes.UUID,
        allowNull: false
      },

      avatar_id: {
        type: DataTypes.UUID,
        allowNull: true
      },

      // [RF-AUTH-01] | CA-04 | Campos preparados para
      // RF-ADM-34. Inicializan en false/'none' en el registro.
      // TODO [RF-ADM-34] (Junio 2026): estos campos son
      // activados en el primer inicio de sesión. Ver
      // RF-ADM-34 para lógica de activación TOTP.
      totp_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },

      // Secreto TOTP (base32) cifrado en reposo con AES-256-GCM (EncryptionUtil).
      // NULL = TOTP no configurado. Se descifra en el service al verificar.
      totp_secret: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Secreto TOTP base32 cifrado en reposo. NULL = TOTP no configurado.'
      },

      sms_mfa_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'true cuando el usuario tiene SMS MFA activo (gestionado en BD propia)'
      },

      preferred_mfa_method: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'none',
        comment: 'Método MFA preferido: none | totp | sms'
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },

      // Marcador propio de cuenta ELIMINADA (ofuscación irreversible). Distinto de is_active:
      // is_active=false es desactivación reversible; deleted_at!=null es eliminado e intocable.
      // NO es el paranoid de Sequelize (el modelo sigue paranoid: false); se gestiona a mano.
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      // ── Política de privacidad (Ley 1581 / App Store / Play Store) ──
      privacy_policy_version: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: 'Versión de la política de privacidad aceptada al registrarse'
      },

      privacy_policy_accepted_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Fecha y hora exacta de aceptación de la política'
      },

      privacy_policy_accepted_ip: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: 'IP desde la que se aceptó la política (IPv4 o IPv6)'
      }
    },
    {
      tableName: 'users',
      schema: database.schema,
      timestamps: true,
      paranoid: false
    }
  ) as defineUser.Static;

  User.associate = models => {
    User.belongsTo(models.Person, {
      foreignKey: 'person_id',
      as: 'person',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    User.belongsTo(models.Role, {
      foreignKey: 'role_id',
      as: 'role',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });

    User.belongsTo(models.Avatar, {
      foreignKey: 'avatar_id',
      as: 'avatar',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    User.hasMany(models.UserLoginAttempt, {
      foreignKey: 'user_id',
      as: 'login_attempts'
    });

    User.hasMany(models.UserNotificationPreference, {
      foreignKey: 'user_id',
      as: 'notificationPreference'
    });

    User.hasMany(models.UserTrustedDevice, {
      foreignKey: 'user_id',
      as: 'trustedDevices'
    });
  };

  return User;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineUser {
  /** Columnas de users. */
  export interface Attributes {
    user_id: string;
    username: string;
    /** Bcrypt hash of password */
    password_hash: string;
    /** Handle interno estable del usuario (user_<uuid> / staff_<uuid>) */
    auth_username: string | null;
    person_id: string;
    role_id: string;
    avatar_id: string | null;
    totp_enabled: boolean | null;
    /** Secreto TOTP base32 cifrado en reposo. NULL = TOTP no configurado. */
    totp_secret: string | null;
    /** true cuando el usuario tiene SMS MFA activo (gestionado en BD propia) */
    sms_mfa_enabled: boolean;
    /** Método MFA preferido: none | totp | sms */
    preferred_mfa_method: string;
    is_active: boolean | null;
    deleted_at: Date | null;
    /** Versión de la política de privacidad aceptada al registrarse */
    privacy_policy_version: string | null;
    /** Fecha y hora exacta de aceptación de la política */
    privacy_policy_accepted_at: Date | null;
    /** IP desde la que se aceptó la política (IPv4 o IPv6) */
    privacy_policy_accepted_ip: string | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'user_id' | 'auth_username' | 'avatar_id' | 'totp_enabled' | 'totp_secret' | 'sms_mfa_enabled' | 'preferred_mfa_method' | 'is_active' | 'deleted_at' | 'privacy_policy_version' | 'privacy_policy_accepted_at' | 'privacy_policy_accepted_ip' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → Person (solo si viene en el include) */
    person?: definePerson.Instance | null;
    /** BelongsTo → Role (solo si viene en el include) */
    role?: defineRole.Instance | null;
    /** BelongsTo → Avatar (solo si viene en el include) */
    avatar?: defineAvatar.Instance | null;
    /** HasMany → UserLoginAttempt (solo si viene en el include) */
    login_attempts?: defineUserLoginAttempt.Instance[];
    /** HasMany → UserNotificationPreference (solo si viene en el include) */
    notificationPreference?: defineUserNotificationPreference.Instance[];
    /** HasMany → UserTrustedDevice (solo si viene en el include) */
    trustedDevices?: defineUserTrustedDevice.Instance[];
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default defineUser;
