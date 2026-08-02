// modules/schemas/kyc/src/repositories/gender.repository.js
const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { Gender } = require('../../../../../shared/models');

class GenderRepository extends BaseRepository {
  constructor() {
    super(Gender, { searchFields: ['name'] });
  }
}

module.exports = new GenderRepository();
