import BaseRepository from '../../../../../shared/repositories/base.repository';
import modelsModule from '../../../../../shared/models';
const { Person } = modelsModule;
import HashUtil from '../../../../../shared/utils/hash.util';
import type definePerson from '../models/person.model';

class PersonRepository extends BaseRepository<definePerson.Instance> {
  constructor() {
    super(Person);
  }

  findByNationalId(nationalId: string) {
    // Buscar por hash — determinístico y seguro
    const hash = HashUtil.hashForSearch(nationalId);
    return this.findOne({ national_id_hash: hash });
  }

  // Misma firma que BaseRepository.delete(id, options) — SOLID: L (no se pierde la transacción)
  override delete(personId: string, options = {}) {
    return this.model.destroy({ where: { person_id: personId }, ...options });
  }
}

export default new PersonRepository();
