const { DataTypes } = require('sequelize');
const { database } = require('../../../../../shared/constants');
const { originSessionModelFields } = require('../../../../../shared/models/mixins/origin-session.mixin');

module.exports = sequelize => {
  const RolePermissionOverride = sequelize.define(
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
  );

  RolePermissionOverride.associate = models => {
    RolePermissionOverride.belongsTo(models.User, {
      foreignKey: 'granted_by_user_id',
      as: 'grantedBy'
    });
  };

  return RolePermissionOverride;
};
