import { DataTypes } from 'sequelize';
import constantsModule from '../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../shared/models/registry';

// Historial de ventanas de fallback: cada vez que el circuit breaker de un producto se ABRE se
// crea una fila (started_at); al CERRARSE se completa (ended_at + duración). Da el "tiempo de
// caída" y el historial de indisponibilidad por proveedor que consume el dashboard.
function defineProviderFallbackEvent(sequelize: Sequelize): defineProviderFallbackEvent.Static {
  const ProviderFallbackEvent = sequelize.define<defineProviderFallbackEvent.Instance>(
    'ProviderFallbackEvent',
    {
      fallback_event_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      provider: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Proveedor/servicio (ej: aws_ses, aws_sns, aws_sms, aws_s3)'
      },

      circuit_product: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Código de producto en el circuit breaker (ej: ses, sns, aws_sms)'
      },

      started_at: {
        type: DataTypes.DATE,
        allowNull: false
      },

      ended_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      affected_processes_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Best-effort: procesos que quedaron en fallo durante la ventana'
      },

      metadata: {
        type: DataTypes.JSONB,
        allowNull: true
      }
    },
    {
      tableName: 'provider_fallback_events',
      schema: database.schema,
      timestamps: true,
      underscored: true
    }
  ) as defineProviderFallbackEvent.Static;

  return ProviderFallbackEvent;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineProviderFallbackEvent {
  /** Columnas de provider_fallback_events. */
  export interface Attributes {
    fallback_event_id: string;
    /** Proveedor/servicio (ej: aws_ses, aws_sns, aws_sms, aws_s3) */
    provider: string;
    /** Código de producto en el circuit breaker (ej: ses, sns, aws_sms) */
    circuit_product: string;
    started_at: Date;
    ended_at: Date | null;
    /** Best-effort: procesos que quedaron en fallo durante la ventana */
    affected_processes_count: number | null;
    metadata: unknown;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'fallback_event_id' | 'ended_at' | 'affected_processes_count' | 'metadata' | 'createdAt' | 'updatedAt'>;

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

export default defineProviderFallbackEvent;
