// modules/client/kyc/iam/services/auth-register/credential-reset.service.js
//
// Reset de credenciales (contraseña o MFA) por enlace de un solo uso enviado al email.
// Extraído de AuthRegisterService (SOLID: S): el registro y el reset cambian por razones distintas.

const crypto = require('node:crypto');
const userRepository = require('../../../../../schemas/kyc/iam/repositories/user.repository');
const personContactRepository = require('../../../../../schemas/kyc/person/repositories/person-contact.repository');
const resetCredentialsRepository = require('../../../../../schemas/kyc/iam/repositories/reset-credentials.repository');
const userSessionRepository = require('../../../../../schemas/kyc/iam/repositories/user-session.repository');
const NotificationUtil = require('../../../../../schemas/notification/services/notification-creation.service');
const KycSharedUtil = require('../../../../../schemas/kyc/person/utils/kyc-shared.util');
const TokenBlacklistUtil = require('../../../../../../shared/utils/token-blacklist.util');
const AppError = require('../../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../../shared/utils/logger.util');
const unitOfWork = require('../../../../../../shared/database/unit-of-work');
const { frontend, SECURITY, notifications } = require('../../../../../../shared/constants');

const RESET_TOKEN_BYTES = 32;
const MS_PER_MINUTE = 60 * 1000;

class CredentialResetService {
  /**
   * @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada
   *   AuthRegisterService; por defecto se usan las implementaciones reales.
   */
  constructor(deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.userRepository = deps.userRepository ?? userRepository;
    this.personContactRepository = deps.personContactRepository ?? personContactRepository;
    this.resetCredentialsRepository = deps.resetCredentialsRepository ?? resetCredentialsRepository;
    this.userSessionRepository = deps.userSessionRepository ?? userSessionRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
    this.kycSharedUtil = deps.kycSharedUtil ?? KycSharedUtil;
  }

  // [RF-AUTH-02] | CA-03 | Genera token de un solo uso (15 min), persiste y envía por email. Anti-enumeración
  async requestResetCredentials(data) {
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
  async confirmResetCredentials(data) {
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
  async _findValidResetRecord(token) {
    const resetRecord = await this.resetCredentialsRepository.findValidTokenWithUser(token);
    if (!resetRecord) {
      throw AppError.badRequest('Token inválido o expirado');
    }
    return resetRecord;
  }

  /** @private */
  async _applyCredentialReset(type, user, newPassword, transaction) {
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

      for (const changeType of ['mfa_status', 'sms_mfa_status']) {
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
  _invalidateSessionsAfterPasswordReset(userId) {
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
  _sendResetConfirmationNotification(user, tipoNotificacion) {
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

module.exports = CredentialResetService;
