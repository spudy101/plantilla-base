import sequelizeModule = require('sequelize');
const { DataTypes } = sequelizeModule;
import constantsModule = require('../../../../../shared/constants');
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineUser = require('../../../kyc/iam/models/user.model');







function defineAuditLog(sequelize: Sequelize): defineAuditLog.Static {
  const AuditLog = sequelize.define<defineAuditLog.Instance>(
    'AuditLog',
    {
      audit_log_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      action: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'Código de acción — ej: USER_REGISTERED, LOGIN_FAILED'
      },

      description: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Descripción legible para humanos'
      },

      category: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Categoría de la acción — ej: Autenticación, Perfil, KYC. Inferida del AUDIT_ACTION.'
      },

      module: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Módulo de la matriz RBAC — ej: client, admin, credit, partners. Inferido del campo module del AUDIT_ACTION.'
      },

      risk: {
        type: DataTypes.ENUM('low', 'medium', 'high', 'critical', 'unknown'),
        allowNull: false,
        defaultValue: 'unknown'
      },

      outcome: {
        type: DataTypes.ENUM('success', 'failure', 'warning', 'attempt'),
        allowNull: false,
        defaultValue: 'success',
        comment: 'Resultado de la operación — success | failure | warning | attempt'
      },

      http_status: {
        type: DataTypes.SMALLINT.UNSIGNED,
        allowNull: true,
        comment: 'Código HTTP de la respuesta — ej: 200, 422, 500'
      },

      error_code: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Código de error de la aplicación — ej: VALIDATION_ERROR, NOT_FOUND'
      },

      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Mensaje de error legible para auditoría regulatoria'
      },

      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Usuario que ejecutó la acción — null si es worker/sistema'
      },

      session_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Sesión (user_sessions.user_session_id) desde la que se originó la acción — null en worker/sistema'
      },

      correlation_id: {
        type: DataTypes.STRING(100),
        allowNull: true
      },

      ip: {
        type: DataTypes.STRING(45),
        allowNull: true
      },

      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      fingerprint: {
        type: DataTypes.STRING(64),
        allowNull: true
      },

      method: {
        type: DataTypes.STRING(10),
        allowNull: true
      },

      path: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      details: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Datos adicionales específicos de la acción. Claves reservadas: before, after (diff en UPDATEs).'
      },

      entity_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'ID del registro afectado. Null en eventos sin entidad puntual (listados, catálogos, etc.).'
      },

      entity_type: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Nombre del modelo afectado — ej: User, TrustedDevice, NotificationType, Role.'
      },

      entity_table: {
        type: DataTypes.STRING(150),
        allowNull: true,
        comment: 'Nombre exacto de la tabla en BD — ej: users, user_trusted_devices, notification_types.'
      },

      source: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'http',
        comment: 'Origen — http | worker | system'
      }
    },
    {
      tableName: 'audit_logs',
      schema: database.schema,
      timestamps: true,
      paranoid: false,
      underscored: true
    }
  ) as defineAuditLog.Static;

  // constraints: false para no crear FK real — los logs deben sobrevivir
  // aunque se elimine un usuario (requerimiento regulatorio).
  AuditLog.associate = models => {
    AuditLog.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'executor',
      constraints: false
    });
  };

  return AuditLog;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineAuditLog {
  /** Columnas de audit_logs. */
  export interface Attributes {
    audit_log_id: string;
    /** Código de acción — ej: USER_REGISTERED, LOGIN_FAILED */
    action: string;
    /** Descripción legible para humanos */
    description: string | null;
    /** Categoría de la acción — ej: Autenticación, Perfil, KYC. Inferida del AUDIT_ACTION. */
    category: string | null;
    /** Módulo de la matriz RBAC — ej: client, admin, credit, partners. Inferido del campo module del AUDIT_ACTION. */
    module: string | null;
    risk: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
    /** Resultado de la operación — success | failure | warning | attempt */
    outcome: 'success' | 'failure' | 'warning' | 'attempt';
    /** Código HTTP de la respuesta — ej: 200, 422, 500 */
    http_status: number | null;
    /** Código de error de la aplicación — ej: VALIDATION_ERROR, NOT_FOUND */
    error_code: string | null;
    /** Mensaje de error legible para auditoría regulatoria */
    error_message: string | null;
    /** Usuario que ejecutó la acción — null si es worker/sistema */
    user_id: string | null;
    /** Sesión (user_sessions.user_session_id) desde la que se originó la acción — null en worker/sistema */
    session_id: string | null;
    correlation_id: string | null;
    ip: string | null;
    user_agent: string | null;
    fingerprint: string | null;
    method: string | null;
    path: string | null;
    /** Datos adicionales específicos de la acción. Claves reservadas: before, after (diff en UPDATEs). */
    details: unknown;
    /** ID del registro afectado. Null en eventos sin entidad puntual (listados, catálogos, etc.). */
    entity_id: string | null;
    /** Nombre del modelo afectado — ej: User, TrustedDevice, NotificationType, Role. */
    entity_type: string | null;
    /** Nombre exacto de la tabla en BD — ej: users, user_trusted_devices, notification_types. */
    entity_table: string | null;
    /** Origen — http | worker | system */
    source: string;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'audit_log_id' | 'description' | 'category' | 'module' | 'risk' | 'outcome' | 'http_status' | 'error_code' | 'error_message' | 'user_id' | 'session_id' | 'correlation_id' | 'ip' | 'user_agent' | 'fingerprint' | 'method' | 'path' | 'details' | 'entity_id' | 'entity_type' | 'entity_table' | 'source' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → User (solo si viene en el include) */
    executor?: defineUser.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export = defineAuditLog;
