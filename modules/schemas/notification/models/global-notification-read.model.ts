import { DataTypes } from 'sequelize';
import constantsModule from '../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../shared/models/registry';
import type defineGlobalNotification from './global-notification.model';
import type defineUser from '../../kyc/iam/models/user.model';

function defineGlobalNotificationRead(sequelize: Sequelize): defineGlobalNotificationRead.Static {
  const GlobalNotificationRead = sequelize.define<defineGlobalNotificationRead.Instance>(
    'GlobalNotificationRead',
    {
      global_notification_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false
      },

      user_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false
      },

      read_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
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
      tableName: 'global_notification_reads',
      schema: database.schema,
      timestamps: false
    }
  ) as defineGlobalNotificationRead.Static;

  GlobalNotificationRead.associate = models => {
    GlobalNotificationRead.belongsTo(models.GlobalNotification, {
      foreignKey: 'global_notification_id',
      as: 'global_notification',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    GlobalNotificationRead.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  };

  return GlobalNotificationRead;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineGlobalNotificationRead {
  /** Columnas de global_notification_reads. */
  export interface Attributes {
    global_notification_id: string;
    user_id: string;
    read_at: Date | null;
    origin_session_id: string | null;
    origin_correlation_id: string | null;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'read_at' | 'origin_session_id' | 'origin_correlation_id'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** BelongsTo → GlobalNotification (solo si viene en el include) */
    global_notification?: defineGlobalNotification.Instance | null;
    /** BelongsTo → User (solo si viene en el include) */
    user?: defineUser.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default defineGlobalNotificationRead;
