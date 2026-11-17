import BaseRepository from '../../../../../shared/repositories/base.repository';
import modelsModule from '../../../../../shared/models';
const { PersonContact } = modelsModule;
import HashUtil from '../../../../../shared/utils/hash.util';
import type { InstanceUpdateOptions } from 'sequelize';
import type definePersonContact from '../models/person-contact.model';

class PersonContactRepository extends BaseRepository<definePersonContact.Instance> {
  constructor() {
    super(PersonContact);
  }

  findByEmail(email: string, options = {}) {
    // Buscar por hash — el cifrado AES-GCM es no determinístico
    const hash = HashUtil.hashForSearch(email);
    return this.findOne({ email_hash: hash }, options);
  }

  /**
   * Contacto por email con la persona (nombre) y su usuario (id, estado).
   * Usado por el reset de credenciales para resolver al titular del email.
   */
  findByEmailWithUser(email: string) {
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

  findByPhone(phone: string) {
    const hash = HashUtil.hashForSearch(phone);
    return this.findOne({ phone_primary_hash: hash });
  }

  findByPersonId(personId: string) {
    return this.findOne({ person_id: personId });
  }

  markEmailVerified(personContactId: string, verifiedAt = new Date(), options = {}) {
    return this._markVerified(personContactId, 'email_verified_at', verifiedAt, options);
  }

  markPhoneVerified(personContactId: string, verifiedAt = new Date(), options = {}) {
    return this._markVerified(personContactId, 'phone_primary_verified_at', verifiedAt, options);
  }

  // Misma firma que BaseRepository.delete(id, options) — SOLID: L (no se pierde la transacción)
  override delete(personContactId: string, options = {}) {
    return this.model.destroy({ where: { person_contact_id: personContactId }, ...options });
  }

  override findById(personContactId: string, options = {}) {
    return this.model.findByPk(personContactId, options);
  }

  _markVerified(
    personContactId: string,
    field: 'email_verified_at' | 'phone_primary_verified_at' | 'phone_secondary_verified_at',
    verifiedAt: Date,
    options?: InstanceUpdateOptions<definePersonContact.Attributes>
  ) {
    return this.update(personContactId, { [field]: verifiedAt }, options);
  }

  findByPrimaryPhone(phone: string) {
    const hash = HashUtil.hashForSearch(phone);
    return this.findOne({ phone_primary_hash: hash });
  }

  findBySecondaryPhone(phone: string) {
    const hash = HashUtil.hashForSearch(phone);
    return this.findOne({ phone_secondary_hash: hash });
  }

  /**
   * Busca contacto por person_id con todas las relaciones de prefijos telefónicos
   */
  findByPersonIdWithPrefixes(personId: string) {
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

export default new PersonContactRepository();
