import type defineUser from '../../../../../schemas/kyc/iam/models/user.model';
import type defineResetCredentials from '../../../../../schemas/kyc/iam/models/reset-credentials.model';
// modules/client/kyc/iam/services/auth-register/credential-reset.service.ts
//
// Reset de credenciales (contraseña o MFA) por enlace de un solo uso enviado al email.
// Extraído de AuthRegisterService (SOLID: S): el registro y el reset cambian por razones distintas.

import type { Transaction } from 'sequelize';
import crypto from 'node:crypto';
import userRepository from '../../../../../schemas/kyc/iam/repositories/user.repository';
import personContactRepository from '../../../../../schemas/kyc/person/repositories/person-contact.repository';
import resetCredentialsRepository from '../../../../../schemas/kyc/iam/repositories/reset-credentials.repository';
import userSessionRepository from '../../../../../schemas/kyc/iam/repositories/user-session.repository';
import NotificationUtil from '../../../../../schemas/notification/services/notification-creation.service';
import KycSharedUtil from '../../../../../schemas/kyc/person/utils/kyc-shared.util';
import TokenBlacklistUtil from '../../../../../../shared/utils/token-blacklist.util';
import AppError from '../../../../../../shared/utils/app-error.util';
import loggerUtilModule from '../../../../../../shared/utils/logger.util';
const { logger, logAudit } = loggerUtilModule;
import unitOfWork from '../../../../../../shared/database/unit-of-work';
import constantsModule from '../../../../../../shared/constants';
const { frontend, SECURITY, notifications } = constantsModule;

const RESET_TOKEN_BYTES = 32;
const MS_PER_MINUTE = 60 * 1000;

class CredentialResetService {
  unitOfWork: typeof unitOfWork;
  userRepository: typeof userRepository;
  personContactRepository: typeof personContactRepository;
  resetCredentialsRepository: typeof resetCredentialsRepository;
  userSessionRepository: typeof userSessionRepository;
  NotificationUtil: typeof NotificationUtil;
  kycSharedUtil: typeof KycSharedUtil;

  /**
   * @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada
   *   AuthRegisterService; por defecto se usan las implementaciones reales.
   */
  constructor(deps: CredentialResetService.Deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.userRepository = deps.userRepository ?? userRepository;
    this.personContactRepository = deps.personContactRepository ?? personContactRepository;
    this.resetCredentialsRepository = deps.resetCredentialsRepository ?? resetCredentialsRepository;
    this.userSessionRepository = deps.userSessionRepository ?? userSessionRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
    this.kycSharedUtil = deps.kycSharedUtil ?? KycSharedUtil;
  }

  // [RF-AUTH-02] | CA-03 | Genera token de un solo uso (15 min), persiste y envía por email. Anti-enumeración
  async requestResetCredentials(data: { email: string; type: CredentialResetService.ResetType }) {
    const { email, type } = data;

    const personContact = await this.personContactRepository.findByEmailWithUser(email);

    if (!personContact?.person?.user) {
      logger.info('Reset requested for non-existent email', { type });
      return false;
    }

    const { user } = personContact.person;

    if (!user.is_active) {
      logger.info('Reset requested for inactive user', { type });
      return false;
    }

    const invalidated = await this.resetCredentialsRepository.invalidateUserTokens(user.user_id);
    if (invalidated > 0) {
      logger.info('Previous reset tokens invalidated', {
        userId: user.user_id,
        count: invalidated,
        type
      });
    }

    const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + SECURITY.RESET_TOKEN_EXPIRATION_MINUTES * MS_PER_MINUTE);

    await this.resetCredentialsRepository.createResetToken({
      user_id: user.user_id,
      email,
      token,
      type,
      expires_at: expiresAt
    });

    logAudit(
      'CREDENTIALS_RESET_REQUESTED',
      user.user_id,
      { type },
      { entityId: user.user_id, entityType: 'User', entityTable: 'users' }
    );

    const firstName = personContact.person.first_name || 'Usuario';
    const resetUrl = `${frontend.resetCredentialUrl}-${type === 'password' ? 'password' : 'totp'}?token=${token}&type=${type}`;

    setImmediate(() => {
      this.NotificationUtil.crearNotificacionDirecta({
        tipoNotificacion: type === 'password' ? 'SOLICITUD_RESET_PASSWORD' : 'SOLICITUD_RESET_MFA',
        email,
        metadata: {
          nombre: firstName,
          email,
          enlace: resetUrl,
          minutosExpiracion: SECURITY.RESET_TOKEN_EXPIRATION_MINUTES,
          logoUrl: notifications.ses.logoUrl
        }
      }).catch(err => logger.warn('Error sending reset notification', { error: err.message }));
    });

    logger.info('Reset credentials requested', { userId: user.user_id, type });
    return true;
  }

  // [RF-AUTH-02] | CA-03 | Valida token, aplica reset, marca used=true, invalida todas las sesiones
  async confirmResetCredentials(data: { token: string; newPassword?: string; type: CredentialResetService.ResetType }) {
    const { token, newPassword, type } = data;

    const resetRecord = await this._findValidResetRecord(token);

    if (resetRecord.type !== type) {
      throw AppError.badRequest('Tipo de reset incorrecto');
    }

    const { user } = resetRecord;
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }

    const transaction = await this.unitOfWork.begin();
    try {
      const tipoNotif = await this._applyCredentialReset(type, user, newPassword, transaction);
      await this.resetCredentialsRepository.markAsUsed(resetRecord.reset_credentials_id, {
        transaction
      });
      await transaction.commit();
      logAudit(
        type === 'password' ? 'PASSWORD_RESET_CONFIRMED' : 'MFA_RESET_CONFIRMED',
        user.user_id,
        { type },
        { entityId: user.user_id, entityType: 'User', entityTable: 'users' }
      );
      this._sendResetConfirmationNotification(user, tipoNotif);
      if (type === 'password') {
        this._invalidateSessionsAfterPasswordReset(user.user_id);
      }
      return null;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // ============================================================
  // PRIVATE
  // ============================================================

  /** @private */
  async _findValidResetRecord(token: string) {
    const resetRecord = await this.resetCredentialsRepository.findValidTokenWithUser(token);
    if (!resetRecord) {
      throw AppError.badRequest('Token inválido o expirado');
    }
    return resetRecord;
  }

  /** @private */
  async _applyCredentialReset(
    type: CredentialResetService.ResetType,
    user: defineUser.Instance,
    newPassword: string | undefined,
    transaction: Transaction
  ) {
    if (type === 'password') {
      if (!newPassword) {
        throw AppError.badRequest('La nueva contraseña es requerida');
      }
      await this.userRepository.updatePassword(user.user_id, newPassword, { transaction });
      return 'RESET_PASSWORD';
    }

    if (type === 'mfa') {
      // Reset total del MFA: baja TOTP (y borra su secreto) y SMS, todo en BD propia.
      await this.userRepository.update(
        user.user_id,
        {
          totp_enabled: false,
          totp_secret: null,
          sms_mfa_enabled: false,
          preferred_mfa_method: 'none'
        },
        { transaction }
      );

      for (const changeType of ['mfa_status', 'sms_mfa_status'] as const) {
        await this.kycSharedUtil.logChange(
          {
            userId: user.user_id,
            changedByUserId: null,
            changedByRole: 'system',
            changeType,
            previousValue: 'enabled',
            newValue: 'disabled',
            changeReason: 'Reset de MFA por pérdida de dispositivo',
            ipAddress: null,
            userAgent: null
          },
          { transaction }
        );
      }

      return 'RESET_MFA';
    }

    throw AppError.badRequest('Tipo de reset no soportado');
  }

  /** @private */
  _invalidateSessionsAfterPasswordReset(userId: string) {
    TokenBlacklistUtil.invalidateUserSessions(userId).catch(err =>
      logger.warn('Error invalidando sesiones en Redis tras reset de contraseña', {
        error: err.message,
        userId
      })
    );
    this.userSessionRepository.closeAllByUser(userId, 'password_reset').catch(err =>
      logger.warn('Error cerrando sesiones en BD tras reset de contraseña', {
        error: err.message,
        userId
      })
    );
  }

  /** @private */
  _sendResetConfirmationNotification(user: defineUser.Instance, tipoNotificacion: string) {
    const firstName = user.person?.first_name || 'Usuario';
    const email = user.person?.contact?.email;
    setImmediate(() => {
      this.NotificationUtil.crearNotificacion({
        tipoNotificacion,
        userId: user.user_id,
        relatedEntity: null,
        metadata: { nombre: firstName, email, logoUrl: notifications.ses.logoUrl }
      }).catch(err =>
        logger.warn('Error sending reset confirmation notification', {
          error: err.message,
          userId: user.user_id
        })
      );
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace CredentialResetService {
  /** password → nueva contraseña; mfa → baja total del MFA (pérdida de dispositivo) */
  export type ResetType = defineResetCredentials.Attributes['type'];

  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    unitOfWork?: typeof unitOfWork;
    userRepository?: typeof userRepository;
    personContactRepository?: typeof personContactRepository;
    resetCredentialsRepository?: typeof resetCredentialsRepository;
    userSessionRepository?: typeof userSessionRepository;
    NotificationUtil?: typeof NotificationUtil;
    kycSharedUtil?: typeof KycSharedUtil;
  }
}

export default CredentialResetService;
