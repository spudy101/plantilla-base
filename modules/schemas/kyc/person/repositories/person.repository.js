const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { Person } = require('../../../../../shared/models');
const HashUtil = require('../../../../../shared/utils/hash.util');

class PersonRepository extends BaseRepository {
  constructor() {
    super(Person);
  }

  findByNationalId(nationalId) {
    // Buscar por hash — determinístico y seguro
    const hash = HashUtil.hashForSearch(nationalId);
    return this.findOne({ national_id_hash: hash });
  }

  // Misma firma que BaseRepository.delete(id, options) — SOLID: L (no se pierde la transacción)
  delete(personId, options = {}) {
    return this.model.destroy({ where: { person_id: personId }, ...options });
  }
}

module.exports = new PersonRepository();
