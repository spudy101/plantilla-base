// modules/schemas/kyc/src/repositories/phone-prefix.repository.ts
import BaseRepository from '../../../../../shared/repositories/base.repository';
import modelsModule from '../../../../../shared/models';
const { PhonePrefix } = modelsModule;
import type definePhonePrefix from '../models/phone-prefix.model';

class PhonePrefixRepository extends BaseRepository<definePhonePrefix.Instance> {
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
  findActiveByPrefix(rawPrefix: string) {
    const digits = String(rawPrefix ?? '').replace(/\D/g, '');
    if (!digits) {
      return null;
    }
    return this.findOne({ prefix: `+${digits}`, is_active: true });
  }
}

export default new PhonePrefixRepository();
