// modules/schemas/kyc/repositories/person-reference.repository.js

const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { PersonReference } = require('../../../../../shared/models');

class PersonReferenceRepository extends BaseRepository {
  constructor() {
    super(PersonReference, {
      searchFields: ['reference_name']
    });
  }

  findAllByPersonId(personId) {
    return this.model.findAll({
      where: { person_id: personId, is_active: true },
      order: [['created_at', 'ASC']]
    });
  }

  findActiveById(referenceId, personId) {
    return this.model.findOne({
      where: { person_reference_id: referenceId, person_id: personId, is_active: true }
    });
  }
}

module.exports = new PersonReferenceRepository();
