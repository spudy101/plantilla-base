// modules/schemas/kyc/repositories/person-reference.repository.ts

import BaseRepository = require('../../../../../shared/repositories/base.repository');
import modelsModule = require('../../../../../shared/models');
const { PersonReference } = modelsModule;
import type definePersonReference = require('../models/person-reference.model');

class PersonReferenceRepository extends BaseRepository<definePersonReference.Instance> {
  constructor() {
    super(PersonReference, {
      searchFields: ['reference_name']
    });
  }

  findAllByPersonId(personId: string) {
    return this.model.findAll({
      where: { person_id: personId, is_active: true },
      order: [['created_at', 'ASC']]
    });
  }

  findActiveById(referenceId: string, personId: string) {
    return this.model.findOne({
      where: { person_reference_id: referenceId, person_id: personId, is_active: true }
    });
  }
}

export = new PersonReferenceRepository();
