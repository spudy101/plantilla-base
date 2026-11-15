// modules/schemas/kyc/src/repositories/role.repository.js
const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { Role } = require('../../../../../shared/models');
const { Op } = require('sequelize');

class RoleRepository extends BaseRepository {
  constructor() {
    super(Role, { searchFields: ['name', 'description'] });
  }

  /** @param {string} name */
  findByName(name) {
    return this.findOne({ name });
  }

  /**
   * Roles cuyo nombre está en `names`, opcionalmente excluyendo `exclude`.
   * Encapsula los operadores de Sequelize para que los services no importen `Op`.
   * @param {string[]} names
   * @param {{ exclude?: string[] }} [opts]
   */
  findByNames(names, { exclude = [] } = {}) {
    const nameCriteria = { [Op.in]: names };
    if (exclude.length) {
      nameCriteria[Op.notIn] = exclude;
    }
    return this.findAll({ name: nameCriteria });
  }
}

module.exports = new RoleRepository();
