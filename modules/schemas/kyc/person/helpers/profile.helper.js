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

/**
 * ============================================================
 * PROFILE HELPER
 * ============================================================
 * Funciones reutilizables compartidas entre ProfileService y
 * cualquier servicio admin que gestione perfiles.
 *
 * Stateless — no se instancia, se importan las funciones directamente.
 * Nunca contiene lógica de negocio propia de un módulo específico.
 */

// ============================================================
// VALIDACIONES
// ============================================================

/**
 * Valida la contraseña actual del usuario.
 * @throws {AppError} Si no coincide
 */
async function validateCurrentPassword(passwordHash, currentPassword) {
  const isValid = await userRepository.verifyPassword(currentPassword, passwordHash);
  if (!isValid) {
    throw AppError.badRequest('Contraseña actual incorrecta');
  }
  return true;
}

/**
 * Valida que el email esté verificado (código OTP confirmado en verification_codes).
 * @throws {AppError} Si no está verificado
 */
async function checkEmailVerified(email) {
  const verificationCode = await verificationCodeRepository.findVerifiedByContact('email', email);
  if (!verificationCode) {
    throw AppError.forbidden('El email debe estar verificado antes de poder actualizarlo');
  }
  return true;
}

/**
 * Valida que el teléfono esté verificado (código OTP confirmado en verification_codes).
 * @throws {AppError} Si no está verificado
 */
async function checkPhoneVerified(phone) {
  const verificationCode = await verificationCodeRepository.findVerifiedByContact('phone', phone);
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
async function validateEmailUnique(email, excludePersonId = null) {
  const existingContact = await personContactRepository.findByEmail(email);
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
async function validatePhoneNotInUse(phone, excludePersonId, _phoneType) {
  const existingPrimary = await personContactRepository.findByPrimaryPhone(phone);
  if (existingPrimary && existingPrimary.person_id !== excludePersonId) {
    throw AppError.conflict('El teléfono ya está en uso por otro usuario');
  }

  const existingSecondary = await personContactRepository.findBySecondaryPhone(phone);
  if (existingSecondary && existingSecondary.person_id !== excludePersonId) {
    throw AppError.conflict('El teléfono ya está en uso por otro usuario');
  }

  return true;
}

/**
 * Valida que el nationalId sea único en el sistema.
 * @throws {AppError} Si ya existe
 */
async function validateNationalIdUnique(nationalId, excludePersonId = null) {
  const existingPerson = await personRepository.findByNationalId(nationalId);
  if (existingPerson && existingPerson.person_id !== excludePersonId) {
    throw AppError.conflict('El National ID ya está registrado');
  }
  return true;
}

/**
 * Valida que el username sea único en el sistema.
 * @throws {AppError} Si ya existe
 */
async function validateUsernameUnique(username, excludeUserId = null) {
  const existingUser = await userRepository.findByUsername(username);
  if (existingUser && existingUser.user_id !== excludeUserId) {
    throw AppError.conflict('El username ya está en uso');
  }
  return true;
}

/**
 * Valida que un avatar exista y esté activo.
 * @throws {AppError} Si no existe o está inactivo
 */
async function validateAvatarExists(avatarId) {
  const avatar = await avatarRepository.findById(avatarId);
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
async function validateGenderExists(genderId) {
  const gender = await genderRepository.findById(genderId);
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
async function validateDocumentTypeExists(documentTypeId) {
  const documentType = await documentTypeRepository.findById(documentTypeId);
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

async function fetchPersonSnapshot(personId) {
  const [person, location] = await Promise.all([
    personRepository.findById(personId),
    personLocationRepository.findByPersonId(personId)
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
async function updateUsername(userId, newUsername, transaction) {
  await validateUsernameUnique(newUsername, userId);
  await userRepository.update(userId, { username: newUsername }, { transaction });
}

/**
 * Actualiza el avatar del usuario, validando que exista.
 */
async function updateAvatar(userId, avatarId, transaction) {
  await validateAvatarExists(avatarId);
  await userRepository.update(userId, { avatar_id: avatarId }, { transaction });
}

/**
 * Actualiza el género de la persona, validando que exista.
 */
async function updateGender(personId, genderId, transaction) {
  await validateGenderExists(genderId);
  await personRepository.update(personId, { gender_id: genderId }, { transaction });
}

/**
 * Valida que país, departamento y ciudad existan y sean consistentes entre sí.
 * @throws {AppError} Si alguno no existe o la jerarquía no es correcta
 */
async function validateLocationHierarchy({ countryId: _countryId, departmentId, cityId }) {
  const department = await departmentRepository.findById(departmentId);
  if (!department) {
    throw AppError.notFound('El departamento especificado no existe');
  }

  const city = await cityRepository.findById(cityId);
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
async function updateLocation(personId, locationData, transaction) {
  await validateLocationHierarchy(locationData); // 👈 validar antes de tocar la BD

  const mappedData = {
    department_id: locationData.departmentId,
    city_id: locationData.cityId,
    postal_code: locationData.postalCode,
    type: locationData.type,
    address: locationData.address ?? null
  };

  await personLocationRepository.upsertByPersonId(personId, mappedData, { transaction });
}

/**
 * Actualiza la fecha de nacimiento de la persona.
 */
async function updateBirthDate(personId, birthDate, transaction) {
  await personRepository.update(personId, { birth_date: birthDate }, { transaction });
}

/**
 * Actualiza los nombres de la persona (primer/segundo nombre, primer/segundo apellido).
 * `firstName` y `lastName` son obligatorios; `middleName` y `secondLastName` aceptan null para limpiarse.
 * Solo incluye en el update las claves presentes en `fields`.
 */
async function updateNames(personId, fields, transaction) {
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

  await personRepository.update(personId, update, { transaction });
  return update;
}

/**
 * Prepara el objeto de campos para actualizar el teléfono en personContact.
 * @param {'primary'|'secondary'} phoneType
 */
function preparePhoneUpdateData(phone, phonePrefixId, phoneType) {
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
async function updateEmailLogic(params) {
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
    await checkEmailVerified(newEmail);
  }

  await validateEmailUnique(newEmail, personId);

  const personContact = await personContactRepository.findByPersonId(personId);
  const oldEmail = personContact.email;

  if (oldEmail === newEmail) {
    throw AppError.badRequest('El nuevo email es igual al actual');
  }

  await personContactRepository.update(
    personContact.person_contact_id,
    { email: newEmail, email_verified_at: new Date() },
    { transaction }
  );

  await KycSharedUtil.logChange(
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
      verificationCodeRepository.deleteVerifiedByContact('email', newEmail).catch(err =>
        require('../../../../../shared/utils/logger.util').logger.warn('Error limpiando verification_code de email', {
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
async function updatePhoneLogic(params) {
  const { personId, phone, phonePrefixId, phoneType, transaction, userId, changedByUserId, changedByRole, auditContext } = params;

  await checkPhoneVerified(phone);
  await validatePhoneNotInUse(phone, personId, phoneType);

  const personContact = await personContactRepository.findByPersonId(personId);
  const oldPhone = phoneType === 'primary' ? personContact.phone_primary : personContact.phone_secondary;

  const updateData = preparePhoneUpdateData(phone, phonePrefixId, phoneType);
  await personContact.update(updateData, { transaction });

  if (userId) {
    await KycSharedUtil.logChange(
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
    verificationCodeRepository.deleteVerifiedByContact('phone', phone).catch(err =>
      require('../../../../../shared/utils/logger.util').logger.warn('Error limpiando verification_code de phone', {
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
async function updatePasswordLogic(params) {
  const { userId, newPassword, changedByUserId, changedByRole, changeReason, auditContext, transaction } = params;

  await userRepository.updatePassword(userId, newPassword, { transaction });

  await KycSharedUtil.logChange(
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
async function updateNationalIdLogic(params) {
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

  const person = await personRepository.findById(personId);
  const oldNationalId = person.national_id;

  // Idempotente: si el valor no cambió, no se toca la BD ni se audita el cambio.
  if (oldNationalId === newNationalId) {
    return { oldNationalId, newNationalId, unchanged: true };
  }

  KycSharedUtil.validateNationalIdByRole(newNationalId, role);
  await validateNationalIdUnique(newNationalId, personId);

  // Si se envía el tipo de documento, validar que exista y esté activo antes de persistir.
  const personUpdate = { national_id: newNationalId };
  if (documentTypeId) {
    await validateDocumentTypeExists(documentTypeId);
    personUpdate.document_type_id = documentTypeId;
  }

  await personRepository.update(personId, personUpdate, { transaction });

  await KycSharedUtil.logChange(
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
async function deleteAccountLogic(params) {
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

  const personContact = await personContactRepository.findByPersonId(personId);

  const newNationalId = KycSharedUtil.formatDeletedNationalId(nationalId);
  const newUsername = KycSharedUtil.formatDeletedUsername(username);
  const newEmail = KycSharedUtil.formatDeletedEmail(email);

  const contactUpdates = { email: newEmail };
  if (personContact.phone_primary) {
    contactUpdates.phone_primary = KycSharedUtil.formatDeletedPhone(personContact.phone_primary);
  }
  if (personContact.phone_secondary) {
    contactUpdates.phone_secondary = KycSharedUtil.formatDeletedPhone(personContact.phone_secondary);
  }

  await personRepository.update(
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
  await userRepository.update(userId, { username: newUsername, is_active: false, deleted_at: new Date() }, { transaction });

  await personContactRepository.update(personContact.person_contact_id, contactUpdates, {
    transaction
  });

  // Anonimizar dirección física (Ley 1581/2012)
  await personLocationRepository.model.update(
    { address: 'ELIMINADO', postal_code: null },
    { where: { person_id: personId }, transaction }
  );

  // Revocar todos los consentimientos vigentes
  await userConsentRepository.revokeAll(userId, transaction);

  await KycSharedUtil.logChange(
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

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Validaciones
  validateCurrentPassword,
  checkEmailVerified,
  checkPhoneVerified,
  validateEmailUnique,
  validatePhoneNotInUse,
  validateNationalIdUnique,
  validateUsernameUnique,
  validateAvatarExists,
  validateGenderExists,

  // Snapshot para auditoría
  fetchPersonSnapshot,

  // Actualizaciones simples
  updateUsername,
  updateAvatar,
  updateGender,
  updateLocation,
  updateBirthDate,
  updateNames,
  preparePhoneUpdateData,

  // Actualizaciones complejas
  updateEmailLogic,
  updatePhoneLogic,
  updatePasswordLogic,
  updateNationalIdLogic,
  deleteAccountLogic
};
