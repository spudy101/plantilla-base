// modules/schemas/kyc/src/repositories/country.repository.ts
import BaseRepository = require('../../../../../shared/repositories/base.repository');
import modelsModule = require('../../../../../shared/models');
const { Country } = modelsModule;
import type defineCountry = require('../models/country.model');

class CountryRepository extends BaseRepository<defineCountry.Instance> {
  constructor() {
    super(Country, { searchFields: ['name', 'code'] });
  }

  findByCode(code: string) {
    return this.model.findOne({ where: { code, is_active: true } });
  }
}

export = new CountryRepository();
