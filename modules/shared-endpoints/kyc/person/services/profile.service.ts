import type { Transaction } from 'sequelize';
import type ProfileTypes = require('../../../../schemas/kyc/person/helpers/profile.types');
import type definePerson = require('../../../../schemas/kyc/person/models/person.model');
import type { RequestAuditContext } from '../../../../../shared/types/audit-context';
import unitOfWork = require('../../../../../shared/database/unit-of-work');
import userRepository = require('../../../../schemas/kyc/iam/repositories/user.repository');
import personRepository = require('../../../../schemas/kyc/person/repositories/person.repository');
import userConsentRepository = require('../../../../schemas/records/legal/repositories/user-consent.repository');
import consentTypeRepository = require('../../../../schemas/records/legal/repositories/consent-type.repository');
import NotificationUtil = require('../../../../schemas/notification/services/notification-creation.service');
import AppError = require('../../../../../shared/utils/app-error.util');
import loggerUtilModule = require('../../../../../shared/utils/logger.util');
const { logger, logAudit } = loggerUtilModule;
import KycSharedUtil = require('../../../../schemas/kyc/person/utils/kyc-shared.util');
import ProfileHelper = require('../../../../schemas/kyc/person/helpers/profile.helper');
import profileDtoModule = require('../dtos/profile.dto');
const {
  BasicProfileDTO,
  ExtendedProfileDTO,
  UpdateEmailResponseDTO,
  UpdatePhoneResponseDTO,
  UpdateNamesResponseDTO
} = profileDtoModule;

class ProfileService {
  unitOfWork: typeof unitOfWork;
  profileHelper: typeof ProfileHelper;
  userRepository: typeof userRepository;
  personRepository: typeof personRepository;
  userConsentRepository: typeof userConsentRepository;
  consentTypeRepository: typeof consentTypeRepository;
  NotificationUtil: typeof NotificationUtil;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new ProfileService({ unitOfWork: fake })
   * @param {object} [deps]
   */
  constructor(deps: ProfileService.Deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.profileHelper = deps.profileHelper ?? ProfileHelper;
    this.userRepository = deps.userRepository ?? userRepository;
    this.personRepository = deps.personRepository ?? personRepository;
    this.userConsentRepository = deps.userConsentRepository ?? userConsentRepository;
    this.consentTypeRepository = deps.consentTypeRepository ?? consentTypeRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
  }

  // ============================================================
  // CONSULTAS
  // ============================================================

  async getProfile(userId: string) {
    const user = await this.userRepository.findByUserId(userId, 'basic');
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }
    const [consentTypes, consents] = await Promise.all([
      this.consentTypeRepository.findAllActive(),
      this.userConsentRepository.findCurrentByUser(userId)
    ]);
    logAudit('PROFILE_VIEWED', userId, {}, { entityId: userId, entityType: 'User', entityTable: 'users' });
    return BasicProfileDTO(user, consentTypes, consents);
  }

  async getExtendedProfile(userId: string) {
    const user = await this.userRepository.findByUserId(userId, 'full');
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }
    const [consentTypes, consents] = await Promise.all([
      this.consentTypeRepository.findAllActive(),
      this.userConsentRepository.findCurrentByUser(userId)
    ]);
    logAudit('PROFILE_EXTENDED_VIEWED', userId, {}, { entityId: userId, entityType: 'User', entityTable: 'users' });
    return ExtendedProfileDTO(user, consentTypes, consents);
  }

  async getContactInfo(personId: string, userId: string) {
    const { PersonContactComponent } = require('../../../../../shared/dtos/kyc');
    const personContactRepository = require('../../../../schemas/kyc/person/repositories/person-contact.repository');
    const contact = await personContactRepository.findByPersonIdWithPrefixes(personId);
    if (!contact) {
      throw AppError.notFound('Informacion de contacto no encontrada');
    }
    logAudit('PROFILE_CONTACT_VIEWED', userId, { personId }, { entityId: userId, entityType: 'User', entityTable: 'users' });
    return PersonContactComponent.build(contact);
  }

  async getLocation(personId: string, userId: string) {
    const { PersonLocationComponent } = require('../../../../../shared/dtos/kyc');
    const personLocationRepository = require('../../../../schemas/kyc/person/repositories/person-location.repository');
    const location = await personLocationRepository.findByPersonId(personId);
    logAudit('PROFILE_LOCATION_VIEWED', userId, { personId }, { entityId: userId, entityType: 'User', entityTable: 'users' });
    return PersonLocationComponent.build(location);
  }

  // ============================================================
  // ACTUALIZACIONES
  // ============================================================

  async updateProfile(
    data: ProfileService.UpdateProfileInput,
    userId: string,
    personId: string,
    username: string | null,
    firstName: string | null,
    auditContext: ProfileTypes.AuditInfo = {}
  ) {
    const snapshot = await this.profileHelper.fetchPersonSnapshot(personId);

    const transaction = await this.unitOfWork.begin();

    try {
      if (data.username && data.username !== username) {
        await this.profileHelper.updateUsername(userId, data.username, transaction);
      }
      if (data.avatarId) {
        await this.profileHelper.updateAvatar(userId, data.avatarId, transaction);
      }
      if (data.genderId) {
        await this.profileHelper.updateGender(personId, data.genderId, transaction);
      }
      if (data.location) {
        await this.profileHelper.updateLocation(personId, data.location, transaction);
      }
      if (data.birthDate) {
        await this.profileHelper.updateBirthDate(personId, data.birthDate, transaction);
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
        this.NotificationUtil.crearNotificacion({
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

      const updatedUser = await this.userRepository.findByUserId(userId, 'full');
      if (!updatedUser) {
        throw AppError.notFound('Usuario no encontrado');
      }
      return ExtendedProfileDTO(updatedUser);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async updateEmail(data: { email: string; currentPassword: string }, userId: string, personId: string, firstName: string | null, auditContext: RequestAuditContext) {
    const { email, currentPassword } = data;

    const user = await this._getUserSecure(userId);
    await this.profileHelper.validateCurrentPassword(user.password_hash, currentPassword);

    const transaction = await this.unitOfWork.begin();

    try {
      const { newEmail } = await this.profileHelper.updateEmailLogic({
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
        this.NotificationUtil.crearNotificacion({
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

  async updatePhone(
    data: { newPhone: string; phonePrefixId: string; phoneType: ProfileTypes.PhoneType },
    userId: string,
    personId: string,
    firstName: string | null,
    auditContext: ProfileTypes.AuditInfo = {}
  ) {
    const { newPhone, phonePrefixId, phoneType } = data;
    const transaction = await this.unitOfWork.begin();

    try {
      const result = await this.profileHelper.updatePhoneLogic({
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
        this.NotificationUtil.crearNotificacion({
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

  async updatePassword(data: { currentPassword: string; newPassword: string }, userId: string, firstName: string | null, auditContext: RequestAuditContext) {
    const { currentPassword, newPassword } = data;

    const user = await this._getUserSecure(userId);
    await this.profileHelper.validateCurrentPassword(user.password_hash, currentPassword);

    const transaction = await this.unitOfWork.begin();

    try {
      await this.profileHelper.updatePasswordLogic({
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
        this.NotificationUtil.crearNotificacion({
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
      // (Se eliminó el caso InvalidPasswordException: era un error de Cognito, código residual)
      throw error;
    }
  }

  /**
   * Actualiza los nombres del cliente (primer/segundo nombre, primer/segundo apellido).
   * En la plantilla no hay validación de identidad, así que los nombres son libremente editables.
   */
  async updateNames(data: ProfileTypes.NamesInput, userId: string, personId: string, firstName: string | null, auditContext: RequestAuditContext) {
    const transaction = await this.unitOfWork.begin();

    try {
      const before = await this.personRepository.findById(personId);
      if (!before) {
        throw AppError.notFound('Persona no encontrada');
      }
      const previousName = _composeFullName(before);

      await this.profileHelper.updateNames(
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
        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'PROFILE_UPDATED',
          userId,
          relatedEntity: null,
          metadata: { nombre: firstName }
        }).catch(err => logger.warn('Error enviando notificacion profile updated', { error: err.message, userId }));
      });

      const updatedPerson = await this.personRepository.findById(personId);
      if (!updatedPerson) {
        throw AppError.notFound('Persona no encontrada');
      }
      return UpdateNamesResponseDTO(updatedPerson);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async deleteAccount(data: { currentPassword: string }, { userId, personId, nationalId, email, firstName, auditContext }: ProfileService.DeleteAccountContext) {
    const { currentPassword } = data;

    const user = await this._getUserSecure(userId);
    await this.profileHelper.validateCurrentPassword(user.password_hash, currentPassword);

    const transaction = await this.unitOfWork.begin();

    try {
      const result = await this.profileHelper.deleteAccountLogic({
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

      const { deletedEmail } = result;
      if (deletedEmail) {
        setImmediate(() => {
          this.NotificationUtil.crearNotificacionDirecta({
            tipoNotificacion: 'CUENTA_ELIMINADA',
            email: deletedEmail,
            metadata: {
              nombre: result.firstName,
              email: deletedEmail
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
  async _getUserSecure(userId: string) {
    const user = await this.userRepository.findByUserId(userId, 'minimal');
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }
    return user;
  }
}

// ============================================================
// PRIVADO — arma el nombre completo a partir de las partes de la persona
// ============================================================

function _composeFullName(
  person: Partial<Pick<definePerson.Attributes, 'first_name' | 'middle_name' | 'last_name' | 'second_last_name'>> | null | undefined
) {
  return [person?.first_name, person?.middle_name, person?.last_name, person?.second_last_name].filter(Boolean).join(' ');
}

// ============================================================
// PRIVADO — registra en user_change_logs los campos de perfil modificados
// ============================================================

async function _logProfileFieldChanges({
  data,
  snapshot,
  userId,
  auditContext,
  transaction
}: {
  data: ProfileService.UpdateProfileInput;
  snapshot: Awaited<ReturnType<(typeof ProfileHelper)['fetchPersonSnapshot']>>;
  userId: string;
  auditContext: ProfileTypes.AuditInfo;
  transaction: Transaction;
}) {
  const ip = auditContext?.ip || auditContext?.ipAddress || null;
  const ua = auditContext?.userAgent || null;
  const base = {
    userId,
    changedByUserId: userId,
    changedByRole: 'user' as const,
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

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace ProfileService {
  export interface UpdateProfileInput {
    username?: string;
    avatarId?: string;
    genderId?: string;
    location?: ProfileTypes.LocationInput;
    birthDate?: string;
  }

  /** Datos de la sesión del titular que el controller pasa al eliminar la cuenta. */
  export interface DeleteAccountContext {
    userId: string;
    personId: string;
    /** Del token: puede faltar en tokens viejos (la ofuscación no depende del valor previo) */
    nationalId: string | null;
    email?: string | null;
    firstName?: string | null;
    auditContext: ProfileTypes.AuditInfo;
  }

  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    unitOfWork?: typeof unitOfWork;
    profileHelper?: typeof ProfileHelper;
    userRepository?: typeof userRepository;
    personRepository?: typeof personRepository;
    userConsentRepository?: typeof userConsentRepository;
    consentTypeRepository?: typeof consentTypeRepository;
    NotificationUtil?: typeof NotificationUtil;
  }
}

export = Object.assign(new ProfileService(), { ProfileService });
