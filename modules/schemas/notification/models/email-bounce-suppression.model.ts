import sequelizeModule = require('sequelize');
const { DataTypes } = sequelizeModule;
import constantsModule = require('../../../../shared/constants');
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../shared/models/registry';
import type defineUser = require('../../kyc/iam/models/user.model');







// Suppression list de correo por dirección (HMAC). Al acumular 3 rebotes duros (hard bounces) la
// dirección pasa a 'suppressed' y todo envío futuro se salta, protegiendo la reputación de envío de
// SES. Nunca persiste el correo en claro (solo email_hash).
function defineEmailBounceSuppression(sequelize: Sequelize): defineEmailBounceSuppression.Static {
  const EmailBounceSuppression = sequelize.define<defineEmailBounceSuppression.Instance>(
    'EmailBounceSuppression',
    {
      email_bounce_suppression_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      email_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        comment: 'Hash SHA-256 de la dirección normalizada — nunca el correo en claro'
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      bounce_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      status: {
        type: DataTypes.ENUM('active', 'suppressed'),
        allowNull: false,
        defaultValue: 'active'
      },
      last_error_code: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      last_bounce_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      suppressed_at: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: 'email_bounce_suppressions',
      schema: database.schema,
      timestamps: true,
      underscored: true
    }
  ) as defineEmailBounceSuppression.Static;

  EmailBounceSuppression.associate = models => {
    EmailBounceSuppression.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      constraints: false
    });
  };

  return EmailBounceSuppression;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineEmailBounceSuppression {
  /** Columnas de email_bounce_suppressions. */
  export interface Attributes {
    email_bounce_suppression_id: string;
    /** Hash SHA-256 de la dirección normalizada — nunca el correo en claro */
    email_hash: string;
    user_id: string | null;
    bounce_count: number;
    status: 'active' | 'suppressed';
    last_error_code: string | null;
    last_bounce_at: Date | null;
    suppressed_at: Date | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'email_bounce_suppression_id' | 'user_id' | 'bounce_count' | 'status' | 'last_error_code' | 'last_bounce_at' | 'suppressed_at' | 'createdAt' | 'updatedAt'>;

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

export = defineEmailBounceSuppression;
