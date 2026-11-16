const userRepository = require('../../iam/repositories/user.repository');
const personRepository = require('../repositories/person.repository');
const personContactRepository = require('../repositories/person-contact.repository');
const personLocationRepository = require('../repositories/person-location.repository');
const userConsentRepository = require('../../../records/legal/repositories/user-consent.repository');
const avatarRepository = require('../../maintainers/repositories/avatar.repository');
const genderRepository = require('../../maintainers/repositories/gender.repository');
const documentTypeRepository = require('../../maintainers/repositories/document-type.repository');
const verificationCodeRepository = require('../../../notification/repositories/verification-code.repository');
const departmentRepository = require('../../maintainers/repositories/department.repository');
const cityRepository = require('../../maintainers/repositories/city.repository');
const KycSharedUtil = require('../utils/kyc-shared.util');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logger } = require('../../../../../shared/utils/logger.util');

/**
 * ============================================================
 * PROFILE HELPER
 * ============================================================
 * Operaciones reutilizables sobre el perfil (persona, contacto, ubicación, usuario)
 * compartidas entre ProfileService y los services admin que gestionan perfiles.
 * Nunca contiene lógica de negocio propia de un módulo específico.
 *
 * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones reales:
 *   new ProfileHelper({ personContactRepository: fake })
 */
class ProfileHelper {
  /** @param {object} [deps] */
  constructor(deps = {}) {
    this.userRepository = deps.userRepository ?? userRepository;
    this.personRepository = deps.personRepository ?? personRepository;
    this.personContactRepository = deps.personContactRepository ?? personContactRepository;
    this.personLocationRepository = deps.personLocationRepository ?? personLocationRepository;
    this.userConsentRepository = deps.userConsentRepository ?? userConsentRepository;
    this.avatarRepository = deps.avatarRepository ?? avatarRepository;
    this.genderRepository = deps.genderRepository ?? genderRepository;
    this.documentTypeRepository = deps.documentTypeRepository ?? documentTypeRepository;
    this.verificationCodeRepository = deps.verificationCodeRepository ?? verificationCodeRepository;
    this.departmentRepository = deps.departmentRepository ?? departmentRepository;
    this.cityRepository = deps.cityRepository ?? cityRepository;
    this.kycSharedUtil = deps.kycSharedUtil ?? KycSharedUtil;
  }

  // ============================================================
  // VALIDACIONES
  // ============================================================

  /**
   * Valida la contraseña actual del usuario.
   * @throws {AppError} Si no coincide
   */
  async validateCurrentPassword(passwordHash, currentPassword) {
    const isValid = await this.userRepository.verifyPassword(currentPassword, passwordHash);
    if (!isValid) {
      throw AppError.badRequest('Contraseña actual incorrecta');
    }
    return true;
  }

  /**
   * Valida que el email esté verificado (código OTP confirmado en verification_codes).
   * @throws {AppError} Si no está verificado
   */
  async checkEmailVerified(email) {
    const verificationCode = await this.verificationCodeRepository.findVerifiedByContact('email', email);
    if (!verificationCode) {
      throw AppError.forbidden('El email debe estar verificado antes de poder actualizarlo');
    }
    return true;
  }

  /**
   * Valida que el teléfono esté verificado (código OTP confirmado en verification_codes).
   * @throws {AppError} Si no está verificado
   */
  async checkPhoneVerified(phone) {
    const verificationCode = await this.verificationCodeRepository.findVerifiedByContact('phone', phone);
    if (!verificationCode) {
      throw AppError.forbidden('El teléfono debe estar verificado antes de poder actualizarlo');
    }
    return true;
  }

  /**
   * Valida que el email sea único en el sistema.
   * @param {string} email
   * @param {string|null} excludePersonId - Excluir este personId del chequeo (para el propio usuario)
   * @throws {AppError} Si ya existe
   */
  async validateEmailUnique(email, excludePersonId = null) {
    const existingContact = await this.personContactRepository.findByEmail(email);
    if (existingContact && existingContact.person_id !== excludePersonId) {
      throw AppError.conflict('El email ya está en uso por otro usuario');
    }
    return true;
  }

  /**
   * Valida que el teléfono no esté en uso por otro usuario.
   * Chequea tanto teléfono primario como secundario.
   * @throws {AppError} Si ya existe
   */
  async validatePhoneNotInUse(phone, excludePersonId, _phoneType) {
    const existingPrimary = await this.personContactRepository.findByPrimaryPhone(phone);
    if (existingPrimary && existingPrimary.person_id !== excludePersonId) {
      throw AppError.conflict('El teléfono ya está en uso por otro usuario');
    }

    const existingSecondary = await this.personContactRepository.findBySecondaryPhone(phone);
    if (existingSecondary && existingSecondary.person_id !== excludePersonId) {
      throw AppError.conflict('El teléfono ya está en uso por otro usuario');
    }

    return true;
  }

  /**
   * Valida que el nationalId sea único en el sistema.
   * @throws {AppError} Si ya existe
   */
  async validateNationalIdUnique(nationalId, excludePersonId = null) {
    const existingPerson = await this.personRepository.findByNationalId(nationalId);
    if (existingPerson && existingPerson.person_id !== excludePersonId) {
      throw AppError.conflict('El National ID ya está registrado');
    }
    return true;
  }

  /**
   * Valida que el username sea único en el sistema.
   * @throws {AppError} Si ya existe
   */
  async validateUsernameUnique(username, excludeUserId = null) {
    const existingUser = await this.userRepository.findByUsername(username);
    if (existingUser && existingUser.user_id !== excludeUserId) {
      throw AppError.conflict('El username ya está en uso');
    }
    return true;
  }

  /**
   * Valida que un avatar exista y esté activo.
   * @throws {AppError} Si no existe o está inactivo
   */
  async validateAvatarExists(avatarId) {
    const avatar = await this.avatarRepository.findById(avatarId);
    if (!avatar) {
      throw AppError.notFound('Avatar no encontrado');
    }
    if (!avatar.is_active) {
      throw AppError.badRequest('Avatar no disponible');
    }
    return true;
  }

  /**
   * Valida que un género exista y esté activo.
   * @throws {AppError} Si no existe o está inactivo
   */
  async validateGenderExists(genderId) {
    const gender = await this.genderRepository.findById(genderId);
    if (!gender) {
      throw AppError.notFound('Gender no encontrado');
    }
    if (!gender.is_active) {
      throw AppError.badRequest('Gender no disponible');
    }
    return true;
  }

  /**
   * Valida que el tipo de documento exista y esté activo.
   * @throws {AppError} Si no existe o está inactivo
   */
  async validateDocumentTypeExists(documentTypeId) {
    const documentType = await this.documentTypeRepository.findById(documentTypeId);
    if (!documentType) {
      throw AppError.notFound('Tipo de documento no encontrado');
    }
    if (!documentType.is_active) {
      throw AppError.badRequest('Tipo de documento no disponible');
    }
    return true;
  }

  // ============================================================
  // SNAPSHOT — valores previos para auditoría
  // ============================================================

  async fetchPersonSnapshot(personId) {
    const [person, location] = await Promise.all([
      this.personRepository.findById(personId),
      this.personLocationRepository.findByPersonId(personId)
    ]);

    return {
      genderId: person?.gender_id ?? null,
      birthDate: person?.birth_date ?? null,
      location: location
        ? {
            departmentId: location.department_id,
            cityId: location.city_id,
            postalCode: location.postal_code,
            type: location.type,
            address: location.address ?? null
          }
        : null
    };
  }

  // ============================================================
  // ACTUALIZACIONES SIMPLES
  // ============================================================

  /**
   * Actualiza el username del usuario, validando unicidad.
   */
  async updateUsername(userId, newUsername, transaction) {
    await this.validateUsernameUnique(newUsername, userId);
    await this.userRepository.update(userId, { username: newUsername }, { transaction });
  }

  /**
   * Actualiza el avatar del usuario, validando que exista.
   */
  async updateAvatar(userId, avatarId, transaction) {
    await this.validateAvatarExists(avatarId);
    await this.userRepository.update(userId, { avatar_id: avatarId }, { transaction });
  }

  /**
   * Actualiza el género de la persona, validando que exista.
   */
  async updateGender(personId, genderId, transaction) {
    await this.validateGenderExists(genderId);
    await this.personRepository.update(personId, { gender_id: genderId }, { transaction });
  }

  /**
   * Valida que país, departamento y ciudad existan y sean consistentes entre sí.
   * @throws {AppError} Si alguno no existe o la jerarquía no es correcta
   */
  async validateLocationHierarchy({ countryId: _countryId, departmentId, cityId }) {
    const department = await this.departmentRepository.findById(departmentId);
    if (!department) {
      throw AppError.notFound('El departamento especificado no existe');
    }

    const city = await this.cityRepository.findById(cityId);
    if (!city) {
      throw AppError.notFound('La ciudad especificada no existe');
    }
    if (city.department_id !== departmentId) {
      throw AppError.badRequest('La ciudad no pertenece al departamento especificado');
    }
  }

  /**
   * Upsert de la ubicación de una persona.
   */
  async updateLocation(personId, locationData, transaction) {
    await this.validateLocationHierarchy(locationData); // 👈 validar antes de tocar la BD

    const mappedData = {
      department_id: locationData.departmentId,
      city_id: locationData.cityId,
      postal_code: locationData.postalCode,
      type: locationData.type,
      address: locationData.address ?? null
    };

    await this.personLocationRepository.upsertByPersonId(personId, mappedData, { transaction });
  }

  /**
   * Actualiza la fecha de nacimiento de la persona.
   */
  async updateBirthDate(personId, birthDate, transaction) {
    await this.personRepository.update(personId, { birth_date: birthDate }, { transaction });
  }

  /**
   * Actualiza los nombres de la persona (primer/segundo nombre, primer/segundo apellido).
   * `firstName` y `lastName` son obligatorios; `middleName` y `secondLastName` aceptan null para limpiarse.
   * Solo incluye en el update las claves presentes en `fields`.
   */
  async updateNames(personId, fields, transaction) {
    const { firstName, middleName, lastName, secondLastName } = fields;
    const update = {};

    if (firstName !== undefined) {
      update.first_name = firstName;
    }
    if (lastName !== undefined) {
      update.last_name = lastName;
    }
    if (middleName !== undefined) {
      update.middle_name = middleName === '' ? null : middleName;
    }
    if (secondLastName !== undefined) {
      update.second_last_name = secondLastName === '' ? null : secondLastName;
    }

    await this.personRepository.update(personId, update, { transaction });
    return update;
  }

  /**
   * Prepara el objeto de campos para actualizar el teléfono en personContact.
   * @param {'primary'|'secondary'} phoneType
   */
  preparePhoneUpdateData(phone, phonePrefixId, phoneType) {
    if (phoneType === 'primary') {
      return {
        phone_primary: phone,
        phone_primary_prefix_id: phonePrefixId,
        phone_primary_verified_at: new Date()
      };
    }
    return {
      phone_secondary: phone,
      phone_secondary_prefix_id: phonePrefixId,
      phone_secondary_verified_at: new Date()
    };
  }

  // ============================================================
  // ACTUALIZACIONES COMPLEJAS
  // ============================================================

  /**
   * Lógica completa de actualización de email.
   * Actualiza BD y retorna los datos del cambio.
   *
   * @param {Object} params
   * @param {string}  params.userId
   * @param {string}  params.personId
   * @param {string}  params.newEmail
   * @param {string}  params.changedByUserId
   * @param {string}  params.changedByRole
   * @param {string}  params.changeReason
   * @param {Object}  params.auditContext
   * @param {Object}  params.transaction
   * @param {boolean} params.skipVerificationCheck - true cuando lo hace un admin
   * @returns {Promise<{ oldEmail, newEmail }>}
   */
  async updateEmailLogic(params) {
    const {
      userId,
      personId,
      newEmail,
      changedByUserId,
      changedByRole,
      changeReason,
      auditContext,
      transaction,
      skipVerificationCheck = false
    } = params;

    if (!skipVerificationCheck) {
      await this.checkEmailVerified(newEmail);
    }

    await this.validateEmailUnique(newEmail, personId);

    const personContact = await this.personContactRepository.findByPersonId(personId);
    const oldEmail = personContact.email;

    if (oldEmail === newEmail) {
      throw AppError.badRequest('El nuevo email es igual al actual');
    }

    await this.personContactRepository.update(
      personContact.person_contact_id,
      { email: newEmail, email_verified_at: new Date() },
      { transaction }
    );

    await this.kycSharedUtil.logChange(
      {
        userId,
        changedByUserId,
        changedByRole,
        changeType: 'email',
        previousValue: oldEmail,
        newValue: newEmail,
        changeReason,
        ipAddress: auditContext.ip || auditContext.ipAddress,
        userAgent: auditContext.userAgent
      },
      { transaction }
    );

    // Limpiar el código verificado — ya fue consumido
    if (!skipVerificationCheck) {
      setImmediate(() => {
        this.verificationCodeRepository.deleteVerifiedByContact('email', newEmail).catch(err =>
          logger.warn('Error limpiando verification_code de email', {
            error: err.message
          })
        );
      });
    }

    return { oldEmail, newEmail };
  }

  /**
   * Lógica completa de actualización de teléfono.
   * Valida verificación OTP y unicidad antes de actualizar.
   *
   * @returns {Promise<{ phone, phonePrefixId, phoneType }>}
   */
  async updatePhoneLogic(params) {
    const { personId, phone, phonePrefixId, phoneType, transaction } = params;
    const { userId, changedByUserId, changedByRole, auditContext } = params;

    await this.checkPhoneVerified(phone);
    await this.validatePhoneNotInUse(phone, personId, phoneType);

    const personContact = await this.personContactRepository.findByPersonId(personId);
    const oldPhone = phoneType === 'primary' ? personContact.phone_primary : personContact.phone_secondary;

    const updateData = this.preparePhoneUpdateData(phone, phonePrefixId, phoneType);
    await this.personContactRepository.update(personContact.person_contact_id, updateData, { transaction });

    if (userId) {
      await this.kycSharedUtil.logChange(
        {
          userId,
          changedByUserId: changedByUserId ?? userId,
          changedByRole: changedByRole ?? 'user',
          changeType: 'phone',
          previousValue: oldPhone ?? null,
          newValue: phone,
          changeReason: `Teléfono ${phoneType} actualizado`,
          ipAddress: auditContext?.ip || auditContext?.ipAddress || null,
          userAgent: auditContext?.userAgent || null
        },
        { transaction }
      );
    }

    // Limpiar el código verificado — ya fue consumido
    setImmediate(() => {
      this.verificationCodeRepository.deleteVerifiedByContact('phone', phone).catch(err =>
        logger.warn('Error limpiando verification_code de phone', {
          error: err.message,
          phone
        })
      );
    });

    return { phone, phonePrefixId, phoneType };
  }

  /**
   * Lógica completa de actualización de contraseña.
   * Persiste la nueva contraseña (bcrypt) en BD y registra el cambio.
   */
  async updatePasswordLogic(params) {
    const { userId, newPassword, changedByUserId, changedByRole, changeReason, auditContext, transaction } = params;

    await this.userRepository.updatePassword(userId, newPassword, { transaction });

    await this.kycSharedUtil.logChange(
      {
        userId,
        changedByUserId,
        changedByRole,
        changeType: 'password',
        previousValue: 'hidden',
        newValue: 'hidden',
        changeReason,
        ipAddress: auditContext.ip || auditContext.ipAddress,
        userAgent: auditContext.userAgent
      },
      { transaction }
    );
  }

  /**
   * Lógica completa de actualización de nationalId.
   * Actualiza BD y registra el cambio.
   *
   * @returns {Promise<{ oldNationalId, newNationalId }>}
   */
  async updateNationalIdLogic(params) {
    const {
      userId,
      personId,
      newNationalId,
      documentTypeId,
      role,
      changedByUserId,
      changedByRole,
      changeReason,
      auditContext,
      transaction
    } = params;

    const person = await this.personRepository.findById(personId);
    const oldNationalId = person.national_id;

    // Idempotente: si el valor no cambió, no se toca la BD ni se audita el cambio.
    if (oldNationalId === newNationalId) {
      return { oldNationalId, newNationalId, unchanged: true };
    }

    this.kycSharedUtil.validateNationalIdByRole(newNationalId, role);
    await this.validateNationalIdUnique(newNationalId, personId);

    // Si se envía el tipo de documento, validar que exista y esté activo antes de persistir.
    const personUpdate = { national_id: newNationalId };
    if (documentTypeId) {
      await this.validateDocumentTypeExists(documentTypeId);
      personUpdate.document_type_id = documentTypeId;
    }

    await this.personRepository.update(personId, personUpdate, { transaction });

    await this.kycSharedUtil.logChange(
      {
        userId,
        changedByUserId,
        changedByRole,
        changeType: 'national_id',
        previousValue: oldNationalId,
        newValue: newNationalId,
        changeReason,
        ipAddress: auditContext.ip || auditContext.ipAddress,
        userAgent: auditContext.userAgent
      },
      { transaction }
    );

    return { oldNationalId, newNationalId, unchanged: false };
  }

  /**
   * Lógica completa de eliminación de cuenta.
   * Ofusca los datos de la cuenta en BD.
   *
   * @returns {Promise<{ deletedEmail, deletedNationalId, firstName }>}
   */
  async deleteAccountLogic(params) {
    const {
      userId,
      personId,
      nationalId,
      email,
      username,
      firstName,
      changedByUserId,
      changedByRole,
      changeReason,
      auditContext,
      transaction
    } = params;

    const personContact = await this.personContactRepository.findByPersonId(personId);

    const newNationalId = this.kycSharedUtil.formatDeletedNationalId(nationalId);
    const newUsername = this.kycSharedUtil.formatDeletedUsername(username);
    const newEmail = this.kycSharedUtil.formatDeletedEmail(email);

    const contactUpdates = { email: newEmail };
    if (personContact.phone_primary) {
      contactUpdates.phone_primary = this.kycSharedUtil.formatDeletedPhone(personContact.phone_primary);
    }
    if (personContact.phone_secondary) {
      contactUpdates.phone_secondary = this.kycSharedUtil.formatDeletedPhone(personContact.phone_secondary);
    }

    await this.personRepository.update(
      personId,
      {
        national_id: newNationalId,
        national_id_hash: '0'.repeat(64),
        first_name: 'ELIMINADO',
        last_name: 'ELIMINADO',
        middle_name: null,
        second_last_name: null,
        birth_date: null
      },
      { transaction }
    );

    // Marca la cuenta como eliminada: ofusca el username, la desactiva y sella deleted_at
    // (marcador irreversible que distingue "eliminado" de "desactivado" y la vuelve intocable).
    await this.userRepository.update(
      userId,
      { username: newUsername, is_active: false, deleted_at: new Date() },
      { transaction }
    );

    await this.personContactRepository.update(personContact.person_contact_id, contactUpdates, {
      transaction
    });

    // Anonimizar dirección física (Ley 1581/2012)
    await this.personLocationRepository.anonymizeAddressByPersonId(personId, { transaction });

    // Revocar todos los consentimientos vigentes
    await this.userConsentRepository.revokeAll(userId, transaction);

    await this.kycSharedUtil.logChange(
      {
        userId,
        changedByUserId,
        changedByRole,
        changeType: 'account_status',
        previousValue: 'active',
        newValue: 'eliminated',
        changeReason,
        ipAddress: auditContext.ip || auditContext.ipAddress,
        userAgent: auditContext.userAgent
      },
      { transaction }
    );

    return {
      deletedEmail: email,
      deletedNationalId: newNationalId,
      firstName
    };
  }
}

module.exports = new ProfileHelper();
module.exports.ProfileHelper = ProfileHelper;
