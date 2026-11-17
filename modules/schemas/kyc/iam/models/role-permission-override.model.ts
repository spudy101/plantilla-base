import { DataTypes } from 'sequelize';
import constantsModule from '../../../../../shared/constants';
const { database } = constantsModule;
import originSessionMixinModule from '../../../../../shared/models/mixins/origin-session.mixin';
const { originSessionModelFields } = originSessionMixinModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineUser from './user.model';

function defineRolePermissionOverride(sequelize: Sequelize): defineRolePermissionOverride.Static {
  const RolePermissionOverride = sequelize.define<defineRolePermissionOverride.Instance>(
    'RolePermissionOverride',
    {
      role_permission_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      role_name: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      module_name: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      action: {
        type: DataTypes.STRING(20),
        allowNull: false
      },
      granted_by_user_id: {
        type: DataTypes.UUID,
        allowNull: false
      },

      // Trazabilidad de sesión: qué sesión de admin creó este override de permiso.
      ...originSessionModelFields()
    },
    {
      schema: database.schema,
      tableName: 'role_permission_overrides',
      timestamps: true,
      underscored: true
    }
  ) as defineRolePermissionOverride.Static;

  RolePermissionOverride.associate = models => {
    RolePermissionOverride.belongsTo(models.User, {
      foreignKey: 'granted_by_user_id',
      as: 'grantedBy'
    });
  };

  return RolePermissionOverride;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineRolePermissionOverride {
  /** Columnas de role_permission_overrides. */
  export interface Attributes {
    role_permission_id: string;
    role_name: string;
    module_name: string;
    action: string;
    granted_by_user_id: string;
    origin_session_id: string | null;
    origin_correlation_id: string | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'role_permission_id' | 'origin_session_id' | 'origin_correlation_id' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → User (solo si viene en el include) */
    grantedBy?: defineUser.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export default defineRolePermissionOverride;
