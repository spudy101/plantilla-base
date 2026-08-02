const { RolePermissionOverride } = require('../../../../../shared/models');

class RolePermissionOverrideRepository {
  /** Todos los overrides de un rol, ordenados por módulo + acción. */
  findByRole(roleName) {
    return RolePermissionOverride.findAll({
      where: { role_name: roleName },
      include: [
        {
          association: 'grantedBy',
          attributes: ['user_id', 'username'],
          include: [{ association: 'person', attributes: ['first_name', 'last_name'] }]
        }
      ],
      order: [
        ['module_name', 'ASC'],
        ['action', 'ASC']
      ]
    });
  }

  findById(rolePermissionId) {
    return RolePermissionOverride.findByPk(rolePermissionId);
  }

  create(data) {
    return RolePermissionOverride.create(data);
  }

  /** @returns {Promise<boolean>} true si se eliminó un registro */
  async deleteById(rolePermissionId) {
    const deleted = await RolePermissionOverride.destroy({
      where: { role_permission_id: rolePermissionId }
    });
    return deleted > 0;
  }

  /** Verifica si ya existe el override exacto (para detectar duplicados). */
  async exists(roleName, moduleName, action) {
    const count = await RolePermissionOverride.count({
      where: { role_name: roleName, module_name: moduleName, action }
    });
    return count > 0;
  }

  /** Carga solo module_name + action para usar en RbacService (lookup ligero). */
  async findLookupByRole(roleName) {
    const rows = await RolePermissionOverride.findAll({
      where: { role_name: roleName },
      attributes: ['module_name', 'action']
    });
    return rows.map(r => ({ module_name: r.module_name, action: r.action }));
  }
}

module.exports = new RolePermissionOverrideRepository();
