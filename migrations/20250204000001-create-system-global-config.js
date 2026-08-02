const { database } = require('../shared/constants');

const SCHEMA = database.schema;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'system_global_config', schema: SCHEMA },
      {
        config_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()')
        },
        config_version: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
          comment: 'Version number for configuration tracking'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: 'Whether this configuration is currently active (only one active at a time)'
        },
        currency: {
          type: Sequelize.STRING(10),
          allowNull: false,
          defaultValue: 'CLP',
          comment: 'Currency code (ISO 4217)'
        },
        audit_retention_hot_years: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 5,
          comment: 'Años de retención de logs en almacenamiento caliente (BD consultable). Mínimo 5 según Circular 100 SFC.'
        },
        audit_retention_cold_years: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 10,
          comment: 'Años de retención de logs en almacenamiento frío (S3 Glacier). Mínimo 10 según Circular 100 SFC.'
        },
        audit_hot_purge_enabled: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment:
            'Interruptor de la purga del almacenamiento caliente (RF-ADM-03 CA-3). Cuando es true, el worker ' +
            'audit-archive elimina de la BD los audit_logs que superaron audit_retention_hot_years (la copia ' +
            'permanece en S3/frío). Default false: operación destructiva, la enciende el Superadministrador.'
        },
        integration_resilience: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {
            timeout_ms: 30000,
            manual_review_timeout_ms: 10000,
            max_retries: 3,
            circuit_breaker: { failure_threshold: 5, recovery_time_ms: 60000, failures_ttl_s: 300 }
          },
          comment:
            'Resiliencia homologada de TODAS las integraciones salientes (RF-INT-01 CA-6). Estructura: ' +
            '{ timeout_ms, manual_review_timeout_ms (fast-fail originación manual RF-CRE-04), max_retries, ' +
            'circuit_breaker: { failure_threshold, recovery_time_ms, failures_ttl_s } }. ' +
            'Un solo valor para todos (sin overrides por proveedor). El circuit breaker y los clientes lo leen ' +
            'vía ResilienceConfigResolver (caché 60s) con fallback duro a estos defaults.'
        },

        promotional_banners: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: [],
          comment:
            'Banners promocionales que consume el front (landing pública + app cliente). Array de objetos ' +
            '{ id, title, text, tag, button_route, image_url, is_active, sort_order }. La imagen vive en el ' +
            'bucket público (URL CloudFront) y se sube desde el mantenedor admin de banners.'
        },

        // ── Trazabilidad de sesión: ata la fila a user_sessions / audit_logs.session_id. null en workers ──
        origin_session_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: 'session_id de auth que actualizó la configuración global'
        },
        origin_correlation_id: {
          type: Sequelize.STRING(128),
          allowNull: true,
          comment: 'correlationId del request que actualizó la configuración global'
        },

        created_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('NOW()')
        },
        updated_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('NOW()')
        }
      }
    );

    // Indexes
    await queryInterface.addIndex({ tableName: 'system_global_config', schema: SCHEMA }, ['is_active']);
    await queryInterface.addIndex({ tableName: 'system_global_config', schema: SCHEMA }, ['config_version']);
    await queryInterface.addIndex({ tableName: 'system_global_config', schema: SCHEMA }, ['created_at']);
    await queryInterface.addIndex({ tableName: 'system_global_config', schema: SCHEMA }, ['origin_session_id'], {
      name: 'idx_system_global_config_origin_session_id'
    });

    // Constraint: Solo una configuración activa a la vez
    await queryInterface.addConstraint(
      { tableName: 'system_global_config', schema: SCHEMA },
      {
        type: 'UNIQUE',
        fields: ['is_active'],
        where: {
          is_active: true
        },
        name: 'system_global_config_unique_active'
      }
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ tableName: 'system_global_config', schema: SCHEMA });
  }
};
