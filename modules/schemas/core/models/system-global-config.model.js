const { DataTypes } = require('sequelize');
const { database } = require('../../../../shared/constants');

module.exports = sequelize => {
  const SystemGlobalConfig = sequelize.define(
    'SystemGlobalConfig',
    {
      config_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      config_version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: 'Version number for configuration tracking'
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether this configuration is currently active (only one active at a time)'
      },

      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'CLP',
        comment: 'Currency code (ISO 4217)'
      },

      audit_retention_hot_years: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 5,
        comment: 'Años de retención en BD (caliente).'
      },

      audit_retention_cold_years: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
        comment: 'Años de retención en S3 Glacier (frío).'
      },

      audit_hot_purge_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment:
          'Interruptor de la purga del caliente. true → el worker audit-archive borra de la BD ' +
          'los logs que superaron audit_retention_hot_years (la copia sigue en S3/frío). Default false.'
      },

      // Resiliencia homologada de todas las integraciones salientes. Un solo valor para todos.
      // { timeout_ms, manual_review_timeout_ms, max_retries, circuit_breaker: { failure_threshold, recovery_time_ms, failures_ttl_s } }
      integration_resilience: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {
          timeout_ms: 30000,
          manual_review_timeout_ms: 10000,
          max_retries: 3,
          circuit_breaker: { failure_threshold: 5, recovery_time_ms: 60000, failures_ttl_s: 300 }
        }
      },

      // Banners promocionales del front (landing pública + app cliente). Array de objetos snake_case:
      // { id, title, text, tag, button_route, image_url, is_active, sort_order }. La imagen vive en el
      // bucket público (URL CloudFront) subida desde el mantenedor admin.
      promotional_banners: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: []
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
      tableName: 'system_global_config',
      schema: database.schema,
      timestamps: true,
      paranoid: false,
      underscored: true
    }
  );

  return SystemGlobalConfig;
};
