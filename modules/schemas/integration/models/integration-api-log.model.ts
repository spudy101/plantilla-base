import sequelizeModule = require('sequelize');
const { DataTypes } = sequelizeModule;
import constantsModule = require('../../../../shared/constants');
const { database } = constantsModule;
import domainEnumsModule = require('../../../../shared/constants/domain-enums');
const { INTEGRATION_PRODUCTS, INTEGRATION_RESULTS } = domainEnumsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../shared/models/registry';
import type defineUser = require('../../kyc/iam/models/user.model');
import type defineUserSession = require('../../kyc/iam/models/user-session.model');







// Bitácora central de consumos de integraciones externas (solo AWS en este template:
// SES / S3 / SNS / SMS por SNS). Una fila por llamada al proveedor. Alimenta el
// dashboard de monitoreo (% de éxito, tiempo de respuesta, errores, estado del circuito).
//
// A diferencia del proyecto original, esta versión NO referencia un catálogo de integraciones
// (no hay gestión de integraciones: se controlan por código). En su lugar ancla cada llamada a
// QUIÉN la originó (user_id) y en QUÉ sesión (session_id → user_sessions) para el drill-down.
function defineIntegrationApiLog(sequelize: Sequelize): defineIntegrationApiLog.Static {
  const IntegrationApiLog = sequelize.define<defineIntegrationApiLog.Instance>(
    'IntegrationApiLog',
    {
      api_log_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      product: {
        type: DataTypes.ENUM(...INTEGRATION_PRODUCTS),
        allowNull: false,
        comment: 'Producto/servicio AWS consumido (SES/S3/SNS/SMS por SNS)'
      },

      endpoint: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: 'Operación/endpoint invocado (ej: SES:SendEmailCommand, SNS:PublishCommand:SMS)'
      },

      // Anclaje de la llamada a la sesión del usuario que la originó. Ambos nullable:
      // los consumos desde workers/procesos de sistema no tienen usuario ni sesión.
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Usuario que originó la llamada (auto-capturado del request-context). Null en workers/sistema'
      },

      session_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Sesión (user_sessions) anclada a la llamada. Null en workers/sistema'
      },

      result: {
        type: DataTypes.ENUM(...INTEGRATION_RESULTS),
        allowNull: false,
        comment: 'success | failed | circuit_open (bloqueada por el circuit breaker)'
      },

      response_time_ms: {
        type: DataTypes.INTEGER,
        allowNull: true
      },

      error_code: {
        type: DataTypes.STRING(50),
        allowNull: true
      },

      error_message: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      request_payload: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Payload enviado al proveedor (sanitizado, sin credenciales)'
      },

      response_payload: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Respuesta cruda del proveedor (sanitizada), para diagnóstico'
      },

      // true = fallo por payload inválido señalado por el proveedor (bug nuestro). Se excluye del
      // % de éxito del proveedor. NO se setea en timeouts/5xx/circuit_open.
      is_system_error: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },

      // Notificación asociada al envío SES/SNS, para correlacionar reintentos. Sin FK dura.
      notification_id: {
        type: DataTypes.UUID,
        allowNull: true
      }
    },
    {
      tableName: 'integration_api_logs',
      schema: database.schema,
      timestamps: true,
      updatedAt: false,
      underscored: true
    }
  ) as defineIntegrationApiLog.Static;

  IntegrationApiLog.associate = models => {
    IntegrationApiLog.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      constraints: false
    });

    IntegrationApiLog.belongsTo(models.UserSession, {
      foreignKey: 'session_id',
      targetKey: 'user_session_id',
      as: 'session',
      constraints: false
    });
  };

  return IntegrationApiLog;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineIntegrationApiLog {
  /** Columnas de integration_api_logs. */
  export interface Attributes {
    api_log_id: string;
    /** Producto/servicio AWS consumido (SES/S3/SNS/SMS por SNS) */
    product: 'ses' | 's3' | 'sns' | 'aws_sms';
    /** Operación/endpoint invocado (ej: SES:SendEmailCommand, SNS:PublishCommand:SMS) */
    endpoint: string;
    /** Usuario que originó la llamada (auto-capturado del request-context). Null en workers/sistema */
    user_id: string | null;
    /** Sesión (user_sessions) anclada a la llamada. Null en workers/sistema */
    session_id: string | null;
    /** success | failed | circuit_open (bloqueada por el circuit breaker) */
    result: 'success' | 'failed' | 'circuit_open';
    response_time_ms: number | null;
    error_code: string | null;
    error_message: string | null;
    /** Payload enviado al proveedor (sanitizado, sin credenciales) */
    request_payload: unknown;
    /** Respuesta cruda del proveedor (sanitizada), para diagnóstico */
    response_payload: unknown;
    is_system_error: boolean;
    notification_id: string | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'api_log_id' | 'user_id' | 'session_id' | 'response_time_ms' | 'error_code' | 'error_message' | 'request_payload' | 'response_payload' | 'is_system_error' | 'notification_id' | 'createdAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** BelongsTo → User (solo si viene en el include) */
    user?: defineUser.Instance | null;
    /** BelongsTo → UserSession (solo si viene en el include) */
    session?: defineUserSession.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export = defineIntegrationApiLog;
