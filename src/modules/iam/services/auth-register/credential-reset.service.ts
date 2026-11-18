import type { ResetCredentials } from '../../../../shared/database/generated/prisma/client';
import type { ResetTokenWithUser } from '../../repositories/reset-credentials.repository';

/** Titular del token: id, authUsername, nombre y email. */
type ResetUser = ResetTokenWithUser['user'];
// modules/client/kyc/iam/services/auth-register/credential-reset.service.ts
//
// Reset de credenciales (contraseña o MFA) por enlace de un solo uso enviado al email.
// Extraído de AuthRegisterService (SOLID: S): el registro y el reset cambian por razones distintas.

import crypto from 'node:crypto';
import userRepository from '../../repositories/user.repository';
import personContactRepository from '../../../person/repositories/person-contact.repository';
import resetCredentialsRepository from '../../repositories/reset-credentials.repository';
import userSessionRepository from '../../repositories/user-session.repository';
import NotificationUtil from '../../../notification/services/notification-creation.service';
import KycSharedUtil from '../../../person/utils/kyc-shared.util';
import TokenBlacklistUtil from '../../utils/token-blacklist.util';
import AppError from '../../../../shared/http/app-error.util';
import loggerUtilModule from '../../../../shared/observability/logger.util';
const { logger, logAudit } = loggerUtilModule;
import unitOfWork from '../../../../shared/database/unit-of-work';
import constantsModule from '../../../../shared/constants';
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

    if (!user.isActive) {
      logger.info('Reset requested for inactive user', { type });
      return false;
    }

    const invalidated = await this.resetCredentialsRepository.invalidateUserTokens(user.userId);
    if (invalidated > 0) {
      logger.info('Previous reset tokens invalidated', {
        userId: user.userId,
        count: invalidated,
        type
      });
    }

    const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + SECURITY.RESET_TOKEN_EXPIRATION_MINUTES * MS_PER_MINUTE);

    await this.resetCredentialsRepository.createResetToken({
      userId: user.userId,
      email,
      token,
      type,
      expiresAt: expiresAt
    });

    logAudit(
      'CREDENTIALS_RESET_REQUESTED',
      user.userId,
      { type },
      { entityId: user.userId, entityType: 'User', entityTable: 'users' }
    );

    const firstName = personContact.person.firstName || 'Usuario';
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

    logger.info('Reset credentials requested', { userId: user.userId, type });
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

    const tipoNotif = await this.unitOfWork.run(async () => {
      // Se consume primero y solo si sigue sin usar: dos requests simultáneos con el mismo token ya no
      // aplican el reset dos veces (el segundo revierte).
      if (!(await this.resetCredentialsRepository.markAsUsed(resetRecord.resetCredentialsId))) {
        throw AppError.badRequest('Token inválido o expirado');
      }
      return this._applyCredentialReset(type, user, newPassword);
    });
    logAudit(
      type === 'password' ? 'PASSWORD_RESET_CONFIRMED' : 'MFA_RESET_CONFIRMED',
      user.userId,
      { type },
      { entityId: user.userId, entityType: 'User', entityTable: 'users' }
    );
    this._sendResetConfirmationNotification(user, tipoNotif);
    if (type === 'password') {
      this._invalidateSessionsAfterPasswordReset(user.userId);
    }
    return null;
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
  async _applyCredentialReset(type: CredentialResetService.ResetType, user: ResetUser, newPassword: string | undefined) {
    if (type === 'password') {
      if (!newPassword) {
        throw AppError.badRequest('La nueva contraseña es requerida');
      }
      await this.userRepository.updatePassword(user.userId, newPassword);
      return 'RESET_PASSWORD';
    }

    if (type === 'mfa') {
      // Reset total del MFA: baja TOTP (y borra su secreto) y SMS, todo en BD propia.
      await this.userRepository.update(user.userId, {
        totpEnabled: false,
        totpSecret: null,
        smsMfaEnabled: false,
        preferredMfaMethod: 'none'
      });

      for (const changeType of ['mfa_status', 'sms_mfa_status'] as const) {
        await this.kycSharedUtil.logChange({
          userId: user.userId,
          changedByUserId: null,
          changedByRole: 'system',
          changeType,
          previousValue: 'enabled',
          newValue: 'disabled',
          changeReason: 'Reset de MFA por pérdida de dispositivo',
          ipAddress: null,
          userAgent: null
        });
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
  _sendResetConfirmationNotification(user: ResetUser, tipoNotificacion: string) {
    const firstName = user.person?.firstName || 'Usuario';
    const email = user.person?.contact?.email;
    setImmediate(() => {
      this.NotificationUtil.crearNotificacion({
        tipoNotificacion,
        userId: user.userId,
        relatedEntity: null,
        metadata: { nombre: firstName, email, logoUrl: notifications.ses.logoUrl }
      }).catch(err =>
        logger.warn('Error sending reset confirmation notification', {
          error: err.message,
          userId: user.userId
        })
      );
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace CredentialResetService {
  /** password → nueva contraseña; mfa → baja total del MFA (pérdida de dispositivo) */
  export type ResetType = ResetCredentials['type'];

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
