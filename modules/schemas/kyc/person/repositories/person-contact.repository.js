const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { PersonContact } = require('../../../../../shared/models');
const HashUtil = require('../../../../../shared/utils/hash.util');

class PersonContactRepository extends BaseRepository {
  constructor() {
    super(PersonContact);
  }

  findByEmail(email, options = {}) {
    // Buscar por hash — el cifrado AES-GCM es no determinístico
    const hash = HashUtil.hashForSearch(email);
    return this.findOne({ email_hash: hash }, options);
  }

  /**
   * Contacto por email con la persona (nombre) y su usuario (id, estado).
   * Usado por el reset de credenciales para resolver al titular del email.
   */
  findByEmailWithUser(email) {
    return this.findByEmail(email, {
      include: [
        {
          association: 'person',
          attributes: ['person_id', 'first_name'],
          include: [{ association: 'user', attributes: ['user_id', 'is_active'] }]
        }
      ]
    });
  }

  findByPhone(phone) {
    const hash = HashUtil.hashForSearch(phone);
    return this.findOne({ phone_primary_hash: hash });
  }

  findByPersonId(personId) {
    return this.findOne({ person_id: personId });
  }

  markEmailVerified(personContactId, verifiedAt = new Date(), options = {}) {
    return this._markVerified(personContactId, 'email_verified_at', verifiedAt, options);
  }

  markPhoneVerified(personContactId, verifiedAt = new Date(), options = {}) {
    return this._markVerified(personContactId, 'phone_primary_verified_at', verifiedAt, options);
  }

  // Misma firma que BaseRepository.delete(id, options) — SOLID: L (no se pierde la transacción)
  delete(personContactId, options = {}) {
    return this.model.destroy({ where: { person_contact_id: personContactId }, ...options });
  }

  findById(personContactId, options = {}) {
    return this.model.findByPk(personContactId, options);
  }

  _markVerified(personContactId, field, verifiedAt, options) {
    return this.update(personContactId, { [field]: verifiedAt }, options);
  }

  findByPrimaryPhone(phone) {
    const hash = HashUtil.hashForSearch(phone);
    return this.findOne({ phone_primary_hash: hash });
  }

  findBySecondaryPhone(phone) {
    const hash = HashUtil.hashForSearch(phone);
    return this.findOne({ phone_secondary_hash: hash });
  }

  /**
   * Busca contacto por person_id con todas las relaciones de prefijos telefónicos
   */
  findByPersonIdWithPrefixes(personId) {
    return this.findOne(
      {
        person_id: personId
      },
      {
        include: [
          {
            association: 'phone_primary_prefix',
            attributes: ['phone_prefix_id', 'prefix']
          },
          {
            association: 'phone_secondary_prefix',
            attributes: ['phone_prefix_id', 'prefix']
          }
        ]
      }
    );
  }
}

module.exports = new PersonContactRepository();
