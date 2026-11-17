// modules/schemas/kyc/models/person-reference.model.ts

import { DataTypes } from 'sequelize';
import constantsModule from '../../../../../shared/constants';
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type definePerson from './person.model';

function definePersonReference(sequelize: Sequelize): definePersonReference.Static {
  const PersonReference = sequelize.define<definePersonReference.Instance>(
    'PersonReference',
    {
      person_reference_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      person_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'Persona dueña de la referencia'
      },

      reference_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: 'Nombre completo de la referencia'
      },

      reference_phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'Teléfono de contacto de la referencia'
      },

      reference_type: {
        type: DataTypes.ENUM('conocido', 'familiar'),
        allowNull: false,
        comment: 'Tipo de referencia: conocido (amigo, colega) o familiar'
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'false cuando el cliente elimina la referencia (soft delete)'
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
      tableName: 'person_references',
      schema: database.schema,
      timestamps: true,
      underscored: true
    }
  ) as definePersonReference.Static;

  PersonReference.associate = models => {
    PersonReference.belongsTo(models.Person, {
      foreignKey: 'person_id',
      as: 'person',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  };

  return PersonReference;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace definePersonReference {
  /** Columnas de person_references. */
  export interface Attributes {
    person_reference_id: string;
    /** Persona dueña de la referencia */
    person_id: string;
    /** Nombre completo de la referencia */
    reference_name: string;
    /** Teléfono de contacto de la referencia */
    reference_phone: string;
    /** Tipo de referencia: conocido (amigo, colega) o familiar */
    reference_type: 'conocido' | 'familiar';
    /** false cuando el cliente elimina la referencia (soft delete) */
    is_active: boolean;
    origin_session_id: string | null;
    origin_correlation_id: string | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'person_reference_id' | 'is_active' | 'origin_session_id' | 'origin_correlation_id' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → Person (solo si viene en el include) */
    person?: definePerson.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default definePersonReference;
