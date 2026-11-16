import sequelizeModule = require('sequelize');
const { DataTypes } = sequelizeModule;
import constantsModule = require('../../../../shared/constants');
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../shared/models/registry';







function defineSystemGlobalConfig(sequelize: Sequelize): defineSystemGlobalConfig.Static {
  const SystemGlobalConfig = sequelize.define<defineSystemGlobalConfig.Instance>(
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
  ) as defineSystemGlobalConfig.Static;

  return SystemGlobalConfig;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineSystemGlobalConfig {
  /** Columnas de system_global_config. */
  export interface Attributes {
    config_id: string;
    /** Version number for configuration tracking */
    config_version: number;
    /** Whether this configuration is currently active (only one active at a time) */
    is_active: boolean;
    /** Currency code (ISO 4217) */
    currency: string;
    /** Años de retención en BD (caliente). */
    audit_retention_hot_years: number;
    /** Años de retención en S3 Glacier (frío). */
    audit_retention_cold_years: number;
    /** Interruptor de la purga del caliente. true → el worker audit-archive borra de la BD los logs que superaron audit_retention_hot_years (la copia sigue en S3/frío). Default false. */
    audit_hot_purge_enabled: boolean;
    integration_resilience: unknown;
    promotional_banners: unknown;
    origin_session_id: string | null;
    origin_correlation_id: string | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'config_id' | 'config_version' | 'is_active' | 'currency' | 'audit_retention_hot_years' | 'audit_retention_cold_years' | 'audit_hot_purge_enabled' | 'integration_resilience' | 'promotional_banners' | 'origin_session_id' | 'origin_correlation_id' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export = defineSystemGlobalConfig;
