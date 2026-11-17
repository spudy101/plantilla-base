import BaseRepository from '../../../../../shared/repositories/base.repository';
import modelsModule from '../../../../../shared/models';
const { RolePermissionOverride } = modelsModule;
import type defineRolePermissionOverride from '../models/role-permission-override.model';

// Hereda findById / create / delete de BaseRepository (SOLID: L — misma firma que el padre).
class RolePermissionOverrideRepository extends BaseRepository<defineRolePermissionOverride.Instance> {
  constructor() {
    super(RolePermissionOverride);
  }

  /** Todos los overrides de un rol, ordenados por módulo + acción. */
  findByRole(roleName: string) {
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
  async deleteById(rolePermissionId: string, options = {}) {
    const deleted = await this.delete(rolePermissionId, options);
    return deleted > 0;
  }

  /**
   * ¿Ya existe el override exacto? (detección de duplicados).
   * Nombre propio: no sobrescribe ReadRepository.exists(criteria), que tiene otra firma.
   */
  existsOverride(roleName: string, moduleName: string, action: defineRolePermissionOverride.Attributes['action']) {
    return this.exists({ role_name: roleName, module_name: moduleName, action });
  }

  /** Carga solo module_name + action para usar en RbacService (lookup ligero). */
  async findLookupByRole(roleName: string) {
    const rows = await this.model.findAll({
      where: { role_name: roleName },
      attributes: ['module_name', 'action']
    });
    return rows.map(r => ({ module_name: r.module_name, action: r.action }));
  }
}

export default new RolePermissionOverrideRepository();
