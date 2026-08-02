const { DataTypes } = require('sequelize');
const { database } = require('../../../../shared/constants');

// Bitácora central de consumos de integraciones externas (solo AWS en este template:
// SES / S3 / SNS / SMS por SNS). Una fila por llamada al proveedor. Alimenta el
// dashboard de monitoreo (% de éxito, tiempo de respuesta, errores, estado del circuito).
//
// A diferencia del proyecto original, esta versión NO referencia un catálogo de integraciones
// (no hay gestión de integraciones: se controlan por código). En su lugar ancla cada llamada a
// QUIÉN la originó (user_id) y en QUÉ sesión (session_id → user_sessions) para el drill-down.
module.exports = sequelize => {
  const IntegrationApiLog = sequelize.define(
    'IntegrationApiLog',
    {
      api_log_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      product: {
        type: DataTypes.ENUM('ses', 's3', 'sns', 'aws_sms'),
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
        type: DataTypes.ENUM('success', 'failed', 'circuit_open'),
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
  );

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
};
