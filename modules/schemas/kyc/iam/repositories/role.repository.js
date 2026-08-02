// modules/schemas/kyc/src/repositories/role.repository.js
const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { Role } = require('../../../../../shared/models');

class RoleRepository extends BaseRepository {
  constructor() {
    super(Role, { searchFields: ['name', 'description'] });
  }

  /** @param {string} name */
  findByName(name) {
    return this.findOne({ name });
  }
}

module.exports = new RoleRepository();
