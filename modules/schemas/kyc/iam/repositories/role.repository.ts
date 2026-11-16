// modules/schemas/kyc/src/repositories/role.repository.ts
import BaseRepository = require('../../../../../shared/repositories/base.repository');
import modelsModule = require('../../../../../shared/models');
const { Role } = modelsModule;
import sequelizeModule = require('sequelize');
const { Op } = sequelizeModule;
import type { FindOptions, WhereOperators } from 'sequelize';
import type defineRole = require('../models/role.model');

class RoleRepository extends BaseRepository<defineRole.Instance> {
  constructor() {
    super(Role, { searchFields: ['name', 'description'] });
  }

  /** @param {string} name */
  // options: { transaction } (antes no se aceptaba y la lectura corría fuera de la transacción del llamador)
  findByName(name: string, options: FindOptions<defineRole.Attributes> = {}) {
    return this.findOne({ name }, options);
  }

  /**
   * Roles cuyo nombre está en `names`, opcionalmente excluyendo `exclude`.
   * Encapsula los operadores de Sequelize para que los services no importen `Op`.
   * @param {string[]} names
   * @param {{ exclude?: string[] }} [opts]
   */
  findByNames(names: string[], { exclude = [] } = {}) {
    const nameCriteria: WhereOperators<string> = { [Op.in]: names };
    if (exclude.length) {
      nameCriteria[Op.notIn] = exclude;
    }
    return this.findAll({ name: nameCriteria });
  }
}

export = new RoleRepository();
