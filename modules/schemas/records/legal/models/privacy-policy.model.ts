import { DataTypes } from 'sequelize';
import constantsModule from '../../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';

function definePrivacyPolicy(sequelize: Sequelize): definePrivacyPolicy.Static {
  const PrivacyPolicy = sequelize.define<definePrivacyPolicy.Instance>(
    'PrivacyPolicy',
    {
      privacy_policy_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      version: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        comment: 'Versión semántica del documento (ej: "1.0", "1.1", "2.0")'
      },

      document_url: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: 'URL pública del PDF (repositorio o S3)'
      },

      document_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: 'Hash SHA-256 (hex) del archivo para verificación de integridad (RF-ADM-05 CA-2)'
      },

      summary: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Resumen de los cambios respecto a la versión anterior'
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Solo una versión puede estar activa a la vez'
      },

      effective_date: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Fecha desde la que esta versión entra en vigor'
      }
    },
    {
      tableName: 'privacy_policies',
      schema: database.schema,
      timestamps: true
    }
  ) as definePrivacyPolicy.Static;

  return PrivacyPolicy;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace definePrivacyPolicy {
  /** Columnas de privacy_policies. */
  export interface Attributes {
    privacy_policy_id: string;
    /** Versión semántica del documento (ej: "1.0", "1.1", "2.0") */
    version: string;
    /** URL pública del PDF (repositorio o S3) */
    document_url: string;
    /** Hash SHA-256 (hex) del archivo para verificación de integridad (RF-ADM-05 CA-2) */
    document_hash: string | null;
    /** Resumen de los cambios respecto a la versión anterior */
    summary: string | null;
    /** Solo una versión puede estar activa a la vez */
    is_active: boolean;
    /** Fecha desde la que esta versión entra en vigor */
    effective_date: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'privacy_policy_id' | 'document_hash' | 'summary' | 'is_active' | 'createdAt' | 'updatedAt'>;

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

export default definePrivacyPolicy;
