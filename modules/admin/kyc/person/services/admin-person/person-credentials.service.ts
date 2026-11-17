import type defineUser from '../../../../../schemas/kyc/iam/models/user.model';
// modules/admin/kyc/person/services/admin-person/person-credentials.service.ts
//
// Credenciales e identidad de una cuenta: reset de contraseña, cambio de email,
// cambio de documento y desactivación de MFA. Extraído de PersonService (SOLID: S).

import type { AdminAuditContext } from '../../../../../../shared/types/audit-context';
import unitOfWork from '../../../../../../shared/database/unit-of-work';
import userRepository from '../../../../../schemas/kyc/iam/repositories/user.repository';
import KycSharedUtil from '../../../../../schemas/kyc/person/utils/kyc-shared.util';
import NotificationUtil from '../../../../../schemas/notification/services/notification-creation.service';
import AppError from '../../../../../../shared/utils/app-error.util';
import loggerUtilModule from '../../../../../../shared/utils/logger.util';
const { logger, logAudit } = loggerUtilModule;
import ProfileHelper from '../../../../../schemas/kyc/person/helpers/profile.helper';
import constantsModule from '../../../../../../shared/constants';
const { notifications } = constantsModule;

import adminPersonDtoModule from '../../dtos/admin-person.dto';
const { ResetPasswordDTO, ChangeEmailDTO, ChangeNationalIdDTO, DisableMFADTO } = adminPersonDtoModule;
import personGuardsModule from './person-guards';
const { assertNotDeleted, requirePerson } = personGuardsModule;

class PersonCredentialsService {
  unitOfWork: typeof unitOfWork;
  profileHelper: typeof ProfileHelper;
  userRepository: typeof userRepository;
  NotificationUtil: typeof NotificationUtil;

  /**
   * @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada
   *   PersonService; por defecto se usan las implementaciones reales.
   */
  constructor(deps: PersonCredentialsService.Deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.profileHelper = deps.profileHelper ?? ProfileHelper;
    this.userRepository = deps.userRepository ?? userRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
  }

  // ============================================================
  // RESET PASSWORD
  // ============================================================

  async resetPassword(userId: string, auditContext: AdminAuditContext) {
    const transaction = await this.unitOfWork.begin();

    try {
      const user = await this.userRepository.findById(userId, {
        include: [
          {
            association: 'person',
            attributes: ['first_name'],
            include: [{ association: 'contact', attributes: ['email'] }]
          }
        ],
        attributes: ['user_id', 'deleted_at']
      });

      if (!user) {
        throw AppError.notFound('Usuario no encontrado');
      }
      assertNotDeleted(user);

      const temporaryPassword = KycSharedUtil.generateSecurePassword();

      await this.userRepository.updatePassword(userId, temporaryPassword, { transaction });

      await KycSharedUtil.logChange(
        {
          userId: user.user_id,
          changedByUserId: auditContext.adminUserId,
          changedByRole: 'admin',
          changeType: 'password',
          previousValue: 'hidden',
          newValue: 'hidden',
          changeReason: 'Contraseña reseteada por administrador',
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        },
        { transaction }
      );

      await transaction.commit();

      logAudit(
        'PERSON_PASSWORD_RESET',
        auditContext.adminUserId,
        {},
        { entityId: userId, entityType: 'User', entityTable: 'users' }
      );

      const affectedNombre = user.person?.first_name || 'Usuario';
      const affectedEmail = user.person?.contact?.email;

      setImmediate(() => {
        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'PASSWORD_RESET_ADMIN',
          userId: user.user_id,
          relatedEntity: null,
          metadata: {
            nombre: affectedNombre,
            email: affectedEmail,
            passwordTemporal: temporaryPassword,
            logoUrl: notifications.ses.logoUrl
          }
        }).catch(err => logger.warn('Error sending password reset notification', { error: err.message }));

        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'PERSON_ADMIN_ACTION',
          userId: auditContext.adminUserId,
          relatedEntity: null,
          metadata: {
            nombre: auditContext.adminFirstName,
            accion: 'reset_password',
            userId: userId,
            logoUrl: notifications.ses.logoUrl
          }
        }).catch(err => logger.warn('Error sending admin action notification', { error: err.message }));
      });

      return ResetPasswordDTO(user);
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  // ============================================================
  // CAMBIAR EMAIL
  // ============================================================

  async changeEmail(userId: string, newEmail: string, auditContext: AdminAuditContext) {
    const transaction = await this.unitOfWork.begin();

    try {
      const user = await this.userRepository.findById(userId, {
        include: [
          {
            association: 'person',
            attributes: ['person_id', 'first_name'],
            include: [{ association: 'contact', attributes: ['person_contact_id', 'email'] }]
          }
        ],
        attributes: ['user_id', 'deleted_at']
      });

      if (!user) {
        throw AppError.notFound('Usuario no encontrado');
      }
      assertNotDeleted(user);

      const { oldEmail, newEmail: updatedEmail } = await this.profileHelper.updateEmailLogic({
        userId,
        personId: requirePerson(user).person_id,
        newEmail,
        changedByUserId: auditContext.adminUserId,
        changedByRole: 'admin',
        changeReason: 'Email actualizado por administrador',
        auditContext: { ipAddress: auditContext.ipAddress, userAgent: auditContext.userAgent },
        transaction,
        skipVerificationCheck: true
      });

      await transaction.commit();

      logAudit(
        'PERSON_EMAIL_CHANGED',
        auditContext.adminUserId,
        {
          before: { email: oldEmail },
          after: { email: updatedEmail }
        },
        { entityId: userId, entityType: 'User', entityTable: 'users' }
      );

      const firstName = user.person?.first_name;

      setImmediate(() => {
        this.NotificationUtil.crearNotificacionDirecta({
          tipoNotificacion: 'EMAIL_CHANGED_OLD',
          email: oldEmail,
          metadata: { nombre: firstName, email: oldEmail, logoUrl: notifications.ses.logoUrl }
        }).catch(err => logger.warn('Error sending old email notification', { error: err.message }));

        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'EMAIL_CHANGED_NEW',
          userId: user.user_id,
          relatedEntity: null,
          metadata: { nombre: firstName, email: updatedEmail, logoUrl: notifications.ses.logoUrl }
        }).catch(err => logger.warn('Error sending new email notification', { error: err.message }));

        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'PERSON_ADMIN_ACTION',
          userId: auditContext.adminUserId,
          relatedEntity: null,
          metadata: {
            nombre: auditContext.adminFirstName,
            accion: 'cambiar_email',
            userId: userId,
            logoUrl: notifications.ses.logoUrl
          }
        }).catch(err => logger.warn('Error sending admin action notification', { error: err.message }));
      });

      return ChangeEmailDTO(user, oldEmail, updatedEmail);
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  // ============================================================
  // CAMBIAR NATIONAL ID
  // ============================================================

  async changeNationalId(userId: string, newNationalId: string, auditContext: AdminAuditContext) {
    const transaction = await this.unitOfWork.begin();

    try {
      const user = await this.userRepository.findById(userId, {
        include: [
          {
            association: 'person',
            attributes: ['person_id', 'national_id', 'first_name'],
            include: [{ association: 'contact', attributes: ['email'] }]
          },
          { association: 'role', attributes: ['role_id', 'name'] }
        ],
        attributes: ['user_id', 'deleted_at']
      });

      if (!user) {
        throw AppError.notFound('Usuario no encontrado');
      }
      assertNotDeleted(user);

      const {
        oldNationalId,
        newNationalId: updated,
        unchanged
      } = await this.profileHelper.updateNationalIdLogic({
        userId,
        personId: requirePerson(user).person_id,
        newNationalId,
        role: user.role ?? { name: '' }, // sin rol cargado no hay regla de formato que aplicar
        changedByUserId: auditContext.adminUserId,
        changedByRole: 'admin',
        changeReason: 'National ID actualizado por administrador',
        auditContext: { ipAddress: auditContext.ipAddress, userAgent: auditContext.userAgent },
        transaction
      });

      await transaction.commit();

      // Idempotente: el valor enviado es igual al actual — no hubo cambio real,
      // se omite auditoría, re-screening SARLAFT y notificaciones; se responde OK.
      if (unchanged) {
        return ChangeNationalIdDTO(user, oldNationalId, updated);
      }

      logAudit(
        'PERSON_NATIONAL_ID_CHANGED',
        auditContext.adminUserId,
        {
          before: { nationalId: oldNationalId },
          after: { nationalId: updated }
        },
        { entityId: userId, entityType: 'User', entityTable: 'users' }
      );

      const affectedEmail = user.person?.contact?.email;
      const firstName = user.person?.first_name;

      setImmediate(() => {
        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'NATIONAL_ID_CHANGED',
          userId: user.user_id,
          relatedEntity: null,
          metadata: { nombre: firstName, email: affectedEmail, logoUrl: notifications.ses.logoUrl }
        }).catch(err => logger.warn('Error sending national id notification', { error: err.message }));

        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'PERSON_ADMIN_ACTION',
          userId: auditContext.adminUserId,
          relatedEntity: null,
          metadata: {
            nombre: auditContext.adminFirstName,
            accion: 'cambiar_national_id',
            userId: userId,
            logoUrl: notifications.ses.logoUrl
          }
        }).catch(err => logger.warn('Error sending admin action notification', { error: err.message }));
      });

      return ChangeNationalIdDTO(user, oldNationalId, updated);
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  // ============================================================
  // DESHABILITAR MFA
  // ============================================================

  async disableMFA(userId: string, auditContext: AdminAuditContext) {
    const transaction = await this.unitOfWork.begin();

    try {
      const user = await this.userRepository.findById(userId, {
        include: [
          {
            association: 'person',
            attributes: ['first_name'],
            include: [{ association: 'contact', attributes: ['email'] }]
          }
        ],
        attributes: ['user_id', 'totp_enabled', 'sms_mfa_enabled', 'preferred_mfa_method', 'deleted_at']
      });

      if (!user) {
        throw AppError.notFound('Usuario no encontrado');
      }
      assertNotDeleted(user);
      if (!user.totp_enabled && !user.sms_mfa_enabled) {
        throw AppError.badRequest('El usuario no tiene MFA habilitado');
      }

      const updates: Partial<defineUser.Attributes> = { preferred_mfa_method: 'none' };
      if (user.totp_enabled) {
        updates.totp_enabled = false;
        updates.totp_secret = null;
      }
      if (user.sms_mfa_enabled) {
        updates.sms_mfa_enabled = false;
      }

      await this.userRepository.update(userId, updates, { transaction });

      await KycSharedUtil.logChange(
        {
          userId: user.user_id,
          changedByUserId: auditContext.adminUserId,
          changedByRole: 'admin',
          changeType: 'mfa_status',
          previousValue: 'enabled',
          newValue: 'disabled',
          changeReason: 'MFA desactivado por administrador',
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        },
        { transaction }
      );

      await transaction.commit();

      logAudit(
        'PERSON_MFA_DISABLED',
        auditContext.adminUserId,
        {
          before: { mfaEnabled: true },
          after: { mfaEnabled: false }
        },
        { entityId: userId, entityType: 'User', entityTable: 'users' }
      );

      this._notifyMFADisabled(user, userId, auditContext);

      user.totp_enabled = false;
      user.sms_mfa_enabled = false;
      user.preferred_mfa_method = 'none';
      return DisableMFADTO(user);
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  /** @private Dispara en background las notificaciones de desactivación de MFA. */
  _notifyMFADisabled(user: defineUser.Instance, userId: string, auditContext: AdminAuditContext) {
    const affectedNombre = user.person?.first_name || 'Usuario';
    const affectedEmail = user.person?.contact?.email;

    setImmediate(() => {
      this.NotificationUtil.crearNotificacion({
        tipoNotificacion: 'RESET_MFA',
        userId: user.user_id,
        relatedEntity: null,
        metadata: {
          nombre: affectedNombre,
          email: affectedEmail,
          logoUrl: notifications.ses.logoUrl
        }
      }).catch(err => logger.warn('Error sending MFA reset notification', { error: err.message }));

      this.NotificationUtil.crearNotificacion({
        tipoNotificacion: 'PERSON_ADMIN_ACTION',
        userId: auditContext.adminUserId,
        relatedEntity: null,
        metadata: {
          nombre: auditContext.adminFirstName,
          accion: 'deshabilitar_mfa',
          userId: userId,
          logoUrl: notifications.ses.logoUrl
        }
      }).catch(err => logger.warn('Error sending admin action notification', { error: err.message }));
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace PersonCredentialsService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    unitOfWork?: typeof unitOfWork;
    profileHelper?: typeof ProfileHelper;
    userRepository?: typeof userRepository;
    NotificationUtil?: typeof NotificationUtil;
  }
}

export default PersonCredentialsService;
