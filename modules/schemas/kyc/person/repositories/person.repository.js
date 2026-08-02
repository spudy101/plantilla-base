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

  delete(personId) {
    return this.model.destroy({ where: { person_id: personId } });
  }
}

module.exports = new PersonRepository();
