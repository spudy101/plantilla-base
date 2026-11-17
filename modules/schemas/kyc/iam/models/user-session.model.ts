import { DataTypes } from 'sequelize';
import domainEnumsModule from '../../../../../shared/constants/domain-enums';
const { USER_SESSION_STATUS } = domainEnumsModule;
import constantsModule from '../../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineUser from './user.model';
import type defineUserTrustedDevice from './user-trusted-device.model';

function defineUserSession(sequelize: Sequelize): defineUserSession.Static {
  const UserSession = sequelize.define<defineUserSession.Instance>(
    'UserSession',
    {
      user_session_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      device_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      jti: {
        type: DataTypes.STRING(36),
        allowNull: false,
        unique: true
      },
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true
      },
      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('active', 'closed'),
        allowNull: false,
        defaultValue: 'active'
      },
      started_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      last_access_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      closed_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      close_reason: {
        type: DataTypes.STRING(50),
        allowNull: true
      }
    },
    {
      tableName: 'user_sessions',
      schema: database.schema,
      timestamps: true,
      underscored: true
    }
  ) as defineUserSession.Static;

  UserSession.STATUS = USER_SESSION_STATUS;

  UserSession.associate = models => {
    UserSession.belongsTo(models.UserTrustedDevice, {
      foreignKey: 'device_id',
      as: 'device'
    });
    UserSession.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'sessionUser',
      constraints: false
    });
  };

  return UserSession;
}


// Extensiones manuales (no generadas): se fusionan con los tipos de abajo.
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineUserSession {
  export interface StaticExtensions {
    STATUS: typeof USER_SESSION_STATUS;
  }
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineUserSession {
  /** Columnas de user_sessions. */
  export interface Attributes {
    user_session_id: string;
    user_id: string;
    device_id: string | null;
    jti: string;
    ip_address: string | null;
    user_agent: string | null;
    status: 'active' | 'closed';
    started_at: Date;
    last_access_at: Date;
    closed_at: Date | null;
    close_reason: string | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'user_session_id' | 'device_id' | 'ip_address' | 'user_agent' | 'status' | 'started_at' | 'last_access_at' | 'closed_at' | 'close_reason' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → UserTrustedDevice (solo si viene en el include) */
    device?: defineUserTrustedDevice.Instance | null;
    /** BelongsTo → User (solo si viene en el include) */
    sessionUser?: defineUser.Instance | null;
  }

  export type Static = ModelStatic<Instance> & StaticExtensions & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default defineUserSession;
