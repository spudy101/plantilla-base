// modules/schemas/kyc/src/repositories/phone-prefix.repository.js
const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { PhonePrefix } = require('../../../../../shared/models');

class PhonePrefixRepository extends BaseRepository {
  constructor() {
    super(PhonePrefix, {
      searchFields: ['prefix'],
      filterIdField: 'country_id',
      filterIdKey: 'countryId',
      defaultInclude: [{ association: 'country', attributes: ['country_id', 'name', 'code'] }]
    });
  }

  /**
   * Resuelve un prefijo activo a partir del valor crudo del bureau.
   * Normaliza a solo dígitos y antepone '+' (en BD se guarda con '+', ej '+57').
   *
   * @param {string} rawPrefix - Prefijo del bureau (ej: '57')
   * @returns {Promise<PhonePrefix|null>}
   */
  findActiveByPrefix(rawPrefix) {
    const digits = String(rawPrefix ?? '').replace(/\D/g, '');
    if (!digits) {
      return null;
    }
    return this.findOne({ prefix: `+${digits}`, is_active: true });
  }
}

module.exports = new PhonePrefixRepository();
