// modules/schemas/kyc/src/repositories/gender.repository.ts
import BaseRepository = require('../../../../../shared/repositories/base.repository');
import modelsModule = require('../../../../../shared/models');
const { Gender } = modelsModule;
import type defineGender = require('../models/gender.model');

class GenderRepository extends BaseRepository<defineGender.Instance> {
  constructor() {
    super(Gender, { searchFields: ['name'] });
  }
}

export = new GenderRepository();
