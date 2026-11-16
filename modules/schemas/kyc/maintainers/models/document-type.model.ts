// modules/schemas/kyc/models/document-type.model.ts

import sequelizeModule = require('sequelize');
const { DataTypes } = sequelizeModule;
import constantsModule = require('../../../../../shared/constants');
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type definePerson = require('../../person/models/person.model');







function defineDocumentType(sequelize: Sequelize): defineDocumentType.Static {
  const DocumentType = sequelize.define<defineDocumentType.Instance>(
    'DocumentType',
    {
      document_type_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      // Sigla del tipo de documento (CC, CE, TI, PA, PPT, SYSTEM)
      code: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        comment: 'Sigla del tipo de documento — ej: CC, CE, TI, PA, PPT'
      },
      // Nombre completo legible para el usuario
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'Nombre completo del tipo de documento'
      },
      // Si es false, no se muestra en el selector del formulario de registro
      is_visible_to_client: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Si es false, el tipo es interno y no se expone al cliente'
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      }
    },
    {
      tableName: 'document_types',
      schema: database.schema,
      timestamps: true,
      underscored: true
    }
  ) as defineDocumentType.Static;

  DocumentType.associate = models => {
    DocumentType.hasMany(models.Person, {
      foreignKey: 'document_type_id',
      as: 'persons',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });
  };

  return DocumentType;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineDocumentType {
  /** Columnas de document_types. */
  export interface Attributes {
    document_type_id: string;
    /** Sigla del tipo de documento — ej: CC, CE, TI, PA, PPT */
    code: string;
    /** Nombre completo del tipo de documento */
    name: string;
    /** Si es false, el tipo es interno y no se expone al cliente */
    is_visible_to_client: boolean;
    is_active: boolean;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'document_type_id' | 'is_visible_to_client' | 'is_active' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** HasMany → Person (solo si viene en el include) */
    persons?: definePerson.Instance[];
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export = defineDocumentType;
