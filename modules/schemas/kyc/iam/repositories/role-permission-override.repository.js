const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { RolePermissionOverride } = require('../../../../../shared/models');

// Hereda findById / create / delete de BaseRepository (SOLID: L — misma firma que el padre).
class RolePermissionOverrideRepository extends BaseRepository {
  constructor() {
    super(RolePermissionOverride);
  }

  /** Todos los overrides de un rol, ordenados por módulo + acción. */
  findByRole(roleName) {
    return this.model.findAll({
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

  /** @returns {Promise<boolean>} true si se eliminó un registro */
  async deleteById(rolePermissionId, options = {}) {
    const deleted = await this.delete(rolePermissionId, options);
    return deleted > 0;
  }

  /**
   * ¿Ya existe el override exacto? (detección de duplicados).
   * Nombre propio: no sobrescribe ReadRepository.exists(criteria), que tiene otra firma.
   */
  existsOverride(roleName, moduleName, action) {
    return this.exists({ role_name: roleName, module_name: moduleName, action });
  }

  /** Carga solo module_name + action para usar en RbacService (lookup ligero). */
  async findLookupByRole(roleName) {
    const rows = await this.model.findAll({
      where: { role_name: roleName },
      attributes: ['module_name', 'action']
    });
    return rows.map(r => ({ module_name: r.module_name, action: r.action }));
  }
}

module.exports = new RolePermissionOverrideRepository();
