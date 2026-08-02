const { sequelize } = require('../../../../../shared/models');
const userRepository = require('../../../../schemas/kyc/iam/repositories/user.repository');
const personRepository = require('../../../../schemas/kyc/person/repositories/person.repository');
const userConsentRepository = require('../../../../schemas/records/legal/repositories/user-consent.repository');
const consentTypeRepository = require('../../../../schemas/records/legal/repositories/consent-type.repository');
const NotificationUtil = require('../../../../schemas/notification/services/notification-creation.service');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../shared/utils/logger.util');
const KycSharedUtil = require('../../../../schemas/kyc/person/utils/kyc-shared.util');
const ProfileHelper = require('../../../../schemas/kyc/person/helpers/profile.helper');
const {
  BasicProfileDTO,
  ExtendedProfileDTO,
  UpdateEmailResponseDTO,
  UpdatePhoneResponseDTO,
  UpdateNamesResponseDTO
} = require('../dtos/profile.dto');

class ProfileService {
  // ============================================================
  // CONSULTAS
  // ============================================================

  async getProfile(userId) {
    const user = await userRepository.findByUserId(userId, 'basic');
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }
    const [consentTypes, consents] = await Promise.all([
      consentTypeRepository.findAllActive(),
      userConsentRepository.findCurrentByUser(userId)
    ]);
    logAudit('PROFILE_VIEWED', userId, {}, { entityId: userId, entityType: 'User', entityTable: 'users' });
    return BasicProfileDTO(user, consentTypes, consents);
  }

  async getExtendedProfile(userId) {
    const user = await userRepository.findByUserId(userId, 'full');
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }
    const [consentTypes, consents] = await Promise.all([
      consentTypeRepository.findAllActive(),
      userConsentRepository.findCurrentByUser(userId)
    ]);
    logAudit('PROFILE_EXTENDED_VIEWED', userId, {}, { entityId: userId, entityType: 'User', entityTable: 'users' });
    return ExtendedProfileDTO(user, consentTypes, consents);
  }

  async getContactInfo(personId, userId) {
    const { PersonContactComponent } = require('../../../../../shared/dtos/kyc');
    const personContactRepository = require('../../../../schemas/kyc/person/repositories/person-contact.repository');
    const contact = await personContactRepository.findByPersonIdWithPrefixes(personId);
    if (!contact) {
      throw AppError.notFound('Informacion de contacto no encontrada');
    }
    logAudit('PROFILE_CONTACT_VIEWED', userId, { personId }, { entityId: userId, entityType: 'User', entityTable: 'users' });
    return PersonContactComponent.build(contact);
  }

  async getLocation(personId, userId) {
    const { PersonLocationComponent } = require('../../../../../shared/dtos/kyc');
    const personLocationRepository = require('../../../../schemas/kyc/person/repositories/person-location.repository');
    const location = await personLocationRepository.findByPersonId(personId);
    logAudit('PROFILE_LOCATION_VIEWED', userId, { personId }, { entityId: userId, entityType: 'User', entityTable: 'users' });
    return PersonLocationComponent.build(location);
  }

  // ============================================================
  // ACTUALIZACIONES
  // ============================================================

  async updateProfile(data, userId, personId, username, firstName, auditContext = {}) {
    const snapshot = await ProfileHelper.fetchPersonSnapshot(personId);

    const transaction = await sequelize.transaction();

    try {
      if (data.username && data.username !== username) {
        await ProfileHelper.updateUsername(userId, data.username, transaction);
      }
      if (data.avatarId) {
        await ProfileHelper.updateAvatar(userId, data.avatarId, transaction);
      }
      if (data.genderId) {
        await ProfileHelper.updateGender(personId, data.genderId, transaction);
      }
      if (data.location) {
        await ProfileHelper.updateLocation(personId, data.location, transaction);
      }
      if (data.birthDate) {
        await ProfileHelper.updateBirthDate(personId, data.birthDate, transaction);
      }

      await _logProfileFieldChanges({ data, snapshot, userId, auditContext, transaction });

      await transaction.commit();

      logAudit(
        'PROFILE_UPDATED',
        userId,
        {
          updatedFields: Object.keys(data)
        },
        { entityId: userId, entityType: 'User', entityTable: 'users' }
      );

      setImmediate(() => {
        NotificationUtil.crearNotificacion({
          tipoNotificacion: 'PROFILE_UPDATED',
          userId,
          relatedEntity: null,
          metadata: { nombre: firstName }
        }).catch(err =>
          logger.warn('Error enviando notificacion profile updated', {
            error: err.message,
            userId
          })
        );
      });

      const updatedUser = await userRepository.findByUserId(userId, 'full');
      return ExtendedProfileDTO(updatedUser);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async updateEmail(data, userId, personId, firstName, auditContext) {
    const { email, currentPassword } = data;

    const user = await this._getUserSecure(userId);
    await ProfileHelper.validateCurrentPassword(user.password_hash, currentPassword);

    const transaction = await sequelize.transaction();

    try {
      const { newEmail } = await ProfileHelper.updateEmailLogic({
        userId,
        personId,
        newEmail: email,
        changedByUserId: userId,
        changedByRole: 'user',
        changeReason: 'Email actualizado por cliente',
        auditContext,
        transaction,
        skipVerificationCheck: false
      });

      await transaction.commit();

      // Cambio de email — riesgo high, dato de contacto crítico
      logAudit('PROFILE_EMAIL_UPDATED', userId, { newEmail }, { entityId: userId, entityType: 'User', entityTable: 'users' });

      setImmediate(() => {
        NotificationUtil.crearNotificacion({
          tipoNotificacion: 'EMAIL_UPDATED',
          userId,
          relatedEntity: null,
          metadata: { nombre: firstName }
        }).catch(err => logger.warn('Error enviando notificacion email updated', { error: err.message, userId }));
      });

      return UpdateEmailResponseDTO(newEmail, new Date());
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async updatePhone(data, userId, personId, firstName, auditContext = {}) {
    const { newPhone, phonePrefixId, phoneType } = data;
    const transaction = await sequelize.transaction();

    try {
      const result = await ProfileHelper.updatePhoneLogic({
        personId,
        phone: newPhone,
        phonePrefixId,
        phoneType,
        transaction,
        userId,
        changedByUserId: userId,
        changedByRole: 'user',
        auditContext
      });

      await transaction.commit();

      logAudit('PROFILE_PHONE_UPDATED', userId, { phoneType }, { entityId: userId, entityType: 'User', entityTable: 'users' });

      setImmediate(() => {
        NotificationUtil.crearNotificacion({
          tipoNotificacion: 'PHONE_UPDATED',
          userId,
          relatedEntity: null,
          metadata: { nombre: firstName }
        }).catch(err => logger.warn('Error enviando notificacion phone updated', { error: err.message, userId }));
      });

      return UpdatePhoneResponseDTO(result.phone, result.phonePrefixId, result.phoneType, new Date());
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async updatePassword(data, userId, firstName, auditContext) {
    const { currentPassword, newPassword } = data;

    const user = await this._getUserSecure(userId);
    await ProfileHelper.validateCurrentPassword(user.password_hash, currentPassword);

    const transaction = await sequelize.transaction();

    try {
      await ProfileHelper.updatePasswordLogic({
        userId,
        newPassword,
        changedByUserId: userId,
        changedByRole: 'user',
        changeReason: 'Contrasena actualizada por cliente',
        auditContext,
        transaction
      });

      await transaction.commit();

      // Cambio de contraseña — riesgo high
      logAudit('PASSWORD_CHANGED', userId, {}, { entityId: userId, entityType: 'User', entityTable: 'users' });

      setImmediate(() => {
        NotificationUtil.crearNotificacion({
          tipoNotificacion: 'PASSWORD_UPDATED',
          userId,
          relatedEntity: null,
          metadata: { nombre: firstName }
        }).catch(err =>
          logger.warn('Error enviando notificacion password updated', {
            error: err.message,
            userId
          })
        );
      });

      return null;
    } catch (error) {
      await transaction.rollback();
      if (error.name === 'InvalidPasswordException') {
        throw AppError.badRequest('La contrasena no cumple con los requisitos de seguridad');
      }
      throw error;
    }
  }

  /**
   * Actualiza los nombres del cliente (primer/segundo nombre, primer/segundo apellido).
   * En la plantilla no hay validación de identidad, así que los nombres son libremente editables.
   */
  async updateNames(data, userId, personId, firstName, auditContext) {
    const transaction = await sequelize.transaction();

    try {
      const before = await personRepository.findById(personId);
      const previousName = _composeFullName(before);

      await ProfileHelper.updateNames(
        personId,
        {
          firstName: data.firstName,
          middleName: data.middleName,
          lastName: data.lastName,
          secondLastName: data.secondLastName
        },
        transaction
      );

      const newName = _composeFullName({
        first_name: data.firstName !== undefined ? data.firstName : before.first_name,
        middle_name: data.middleName !== undefined ? (data.middleName === '' ? null : data.middleName) : before.middle_name,
        last_name: data.lastName !== undefined ? data.lastName : before.last_name,
        second_last_name:
          data.secondLastName !== undefined ? (data.secondLastName === '' ? null : data.secondLastName) : before.second_last_name
      });

      if (previousName !== newName) {
        await KycSharedUtil.logChange(
          {
            userId,
            changedByUserId: userId,
            changedByRole: 'user',
            changeType: 'name',
            previousValue: previousName,
            newValue: newName,
            ipAddress: auditContext?.ip || auditContext?.ipAddress || null,
            userAgent: auditContext?.userAgent || null
          },
          { transaction }
        );
      }

      await transaction.commit();

      logAudit(
        'PROFILE_UPDATED',
        userId,
        { updatedFields: Object.keys(data) },
        { entityId: userId, entityType: 'User', entityTable: 'users' }
      );

      setImmediate(() => {
        NotificationUtil.crearNotificacion({
          tipoNotificacion: 'PROFILE_UPDATED',
          userId,
          relatedEntity: null,
          metadata: { nombre: firstName }
        }).catch(err => logger.warn('Error enviando notificacion profile updated', { error: err.message, userId }));
      });

      const updatedPerson = await personRepository.findById(personId);
      return UpdateNamesResponseDTO(updatedPerson);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async deleteAccount(data, { userId, personId, nationalId, email, firstName, auditContext }) {
    const { currentPassword } = data;

    const user = await this._getUserSecure(userId);
    await ProfileHelper.validateCurrentPassword(user.password_hash, currentPassword);

    const transaction = await sequelize.transaction();

    try {
      const result = await ProfileHelper.deleteAccountLogic({
        userId,
        personId,
        nationalId,
        email,
        username: user.username,
        firstName: firstName || user.person?.first_name || 'Usuario',
        changedByUserId: userId,
        changedByRole: 'user',
        changeReason: 'Cuenta eliminada por el usuario',
        auditContext,
        transaction
      });

      await transaction.commit();

      // Eliminación de cuenta — crítico, acción irreversible
      logAudit('ACCOUNT_DELETED', userId, {}, { entityId: userId, entityType: 'User', entityTable: 'users' });

      if (result.deletedEmail) {
        setImmediate(() => {
          NotificationUtil.crearNotificacionDirecta({
            tipoNotificacion: 'CUENTA_ELIMINADA',
            email: result.deletedEmail,
            metadata: {
              nombre: result.firstName,
              email: result.deletedEmail
            }
          }).catch(err =>
            logger.warn('Error sending account deletion notification', {
              userId,
              error: err.message
            })
          );
        });
      }

      return null;
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  /** @private */
  async _getUserSecure(userId) {
    const user = await userRepository.findByUserId(userId, 'minimal');
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }
    return user;
  }
}

// ============================================================
// PRIVADO — arma el nombre completo a partir de las partes de la persona
// ============================================================

function _composeFullName(person) {
  return [person?.first_name, person?.middle_name, person?.last_name, person?.second_last_name].filter(Boolean).join(' ');
}

// ============================================================
// PRIVADO — registra en user_change_logs los campos de perfil modificados
// ============================================================

async function _logProfileFieldChanges({ data, snapshot, userId, auditContext, transaction }) {
  const ip = auditContext?.ip || auditContext?.ipAddress || null;
  const ua = auditContext?.userAgent || null;
  const base = {
    userId,
    changedByUserId: userId,
    changedByRole: 'user',
    ipAddress: ip,
    userAgent: ua
  };

  if (data.genderId && data.genderId !== snapshot.genderId) {
    await KycSharedUtil.logChange(
      {
        ...base,
        changeType: 'gender',
        previousValue: snapshot.genderId ?? null,
        newValue: data.genderId
      },
      { transaction }
    );
  }

  if (data.birthDate) {
    const prev = snapshot.birthDate ? new Date(snapshot.birthDate).toISOString().slice(0, 10) : null;
    const next = new Date(data.birthDate).toISOString().slice(0, 10);
    if (prev !== next) {
      await KycSharedUtil.logChange(
        {
          ...base,
          changeType: 'birth_date',
          previousValue: prev,
          newValue: next
        },
        { transaction }
      );
    }
  }

  if (data.location) {
    await KycSharedUtil.logChange(
      {
        ...base,
        changeType: 'location',
        previousValue: snapshot.location ? JSON.stringify(snapshot.location) : null,
        newValue: JSON.stringify(data.location),
        changeReason: 'Ubicación de residencia'
      },
      { transaction }
    );
  }
}

module.exports = new ProfileService();
