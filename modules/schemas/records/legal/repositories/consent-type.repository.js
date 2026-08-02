const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { ConsentType } = require('../../../../../shared/models');

class ConsentTypeRepository extends BaseRepository {
  constructor() {
    super(ConsentType, {
      searchFields: ['name', 'code', 'description']
    });
  }

  findByCode(code) {
    return this.model.findOne({ where: { code, is_active: true } });
  }

  findAllActive() {
    return this.model.findAll({ where: { is_active: true }, order: [['name', 'ASC']] });
  }
}

module.exports = new ConsentTypeRepository();
