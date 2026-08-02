// modules/schemas/kyc/src/repositories/country.repository.js
const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { Country } = require('../../../../../shared/models');

class CountryRepository extends BaseRepository {
  constructor() {
    super(Country, { searchFields: ['name', 'code'] });
  }

  findByCode(code) {
    return this.model.findOne({ where: { code, is_active: true } });
  }
}

module.exports = new CountryRepository();
