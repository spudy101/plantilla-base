// modules/schemas/kyc/src/repositories/gender.repository.ts
import BaseRepository from '../../../../../shared/repositories/base.repository';
import modelsModule from '../../../../../shared/models';
const { Gender } = modelsModule;
import type defineGender from '../models/gender.model';

class GenderRepository extends BaseRepository<defineGender.Instance> {
  constructor() {
    super(Gender, { searchFields: ['name'] });
  }
}

export default new GenderRepository();
