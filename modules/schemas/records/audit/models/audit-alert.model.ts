import { DataTypes } from 'sequelize';
import constantsModule from '../../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineUser from '../../../kyc/iam/models/user.model';

function defineAuditAlert(sequelize: Sequelize): defineAuditAlert.Static {
  const AuditAlert = sequelize.define<defineAuditAlert.Instance>(
    'AuditAlert',
    {
      alert_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      audit_log_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Referencia al audit_log origen. Sin FK — independencia regulatoria.'
      },
      action: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      category: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      risk: {
        type: DataTypes.ENUM('low', 'medium', 'high', 'critical', 'unknown'),
        allowNull: false,
        defaultValue: 'high'
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      entity_id: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      entity_type: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      acknowledged: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      acknowledged_by: {
        type: DataTypes.UUID,
        allowNull: true
      },
      acknowledged_at: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: 'audit_alerts',
      schema: database.schema,
      timestamps: true,
      updatedAt: false,
      paranoid: false,
      underscored: true
    }
  ) as defineAuditAlert.Static;

  AuditAlert.associate = models => {
    AuditAlert.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'actor',
      constraints: false
    });
    AuditAlert.belongsTo(models.User, {
      foreignKey: 'acknowledged_by',
      as: 'acknowledgedByUser',
      constraints: false
    });
  };

  return AuditAlert;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineAuditAlert {
  /** Columnas de audit_alerts. */
  export interface Attributes {
    alert_id: string;
    /** Referencia al audit_log origen. Sin FK — independencia regulatoria. */
    audit_log_id: string | null;
    action: string;
    category: string | null;
    risk: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
    user_id: string | null;
    entity_id: string | null;
    entity_type: string | null;
    message: string | null;
    acknowledged: boolean;
    acknowledged_by: string | null;
    acknowledged_at: Date | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'alert_id' | 'audit_log_id' | 'category' | 'risk' | 'user_id' | 'entity_id' | 'entity_type' | 'message' | 'acknowledged' | 'acknowledged_by' | 'acknowledged_at' | 'createdAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** BelongsTo → User (solo si viene en el include) */
    actor?: defineUser.Instance | null;
    /** BelongsTo → User (solo si viene en el include) */
    acknowledgedByUser?: defineUser.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default defineAuditAlert;
