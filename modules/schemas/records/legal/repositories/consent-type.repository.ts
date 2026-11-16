import BaseRepository = require('../../../../../shared/repositories/base.repository');
import modelsModule = require('../../../../../shared/models');
const { ConsentType } = modelsModule;
import type defineConsentType = require('../models/consent-type.model');

class ConsentTypeRepository extends BaseRepository<defineConsentType.Instance> {
  constructor() {
    super(ConsentType, {
      searchFields: ['name', 'code', 'description']
    });
  }

  findByCode(code: string) {
    return this.model.findOne({ where: { code, is_active: true } });
  }

  findAllActive() {
    return this.model.findAll({ where: { is_active: true }, order: [['name', 'ASC']] });
  }
}

export = new ConsentTypeRepository();
