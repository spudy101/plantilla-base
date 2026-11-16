// modules/shared-endpoints/kyc/iam/services/mfa/totp-mfa.service.ts
//
// Segundo factor TOTP (RFC 6238): configuración, activación, verificación y baja.
// Extraído de MFAService (SOLID: S).

import type { RequestAuditContext } from '../../../../../../shared/types/audit-context';
import unitOfWork = require('../../../../../../shared/database/unit-of-work');
import userRepository = require('../../../../../schemas/kyc/iam/repositories/user.repository');
import NotificationUtil = require('../../../../../schemas/notification/services/notification-creation.service');
import TotpUtil = require('../../../../../../shared/utils/totp.util');
import EncryptionUtil = require('../../../../../../shared/utils/encryption.util');
import AppError = require('../../../../../../shared/utils/app-error.util');
import loggerUtilModule = require('../../../../../../shared/utils/logger.util');
const { logger, logAudit } = loggerUtilModule;
import mfaDtoModule = require('../../dtos/mfa.dto');
const { TOTPSetupResponseDTO, TOTPActivationResponseDTO, TOTPVerificationResponseDTO } = mfaDtoModule;
import MfaAccount = require('./mfa-account');

const ENTITY = { entityType: 'User', entityTable: 'users' };

class TotpMfaService {
  unitOfWork: typeof unitOfWork;
  userRepository: typeof userRepository;
  NotificationUtil: typeof NotificationUtil;
  account: InstanceType<typeof MfaAccount>;

  /** @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada MFAService. */
  constructor(deps: TotpMfaService.Deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.userRepository = deps.userRepository ?? userRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
    this.account = deps.account ?? new MfaAccount(deps);
  }

  async setupTOTP(userId: string, username: string | null) {
    const user = await this.account.getUserSecure(userId);
    if (user.totp_enabled) {
      throw AppError.conflict('TOTP ya esta activado para este usuario');
    }

    // Generamos el secreto nosotros (RFC 6238) y lo persistimos CIFRADO. Aún no
    // se activa: totp_enabled sigue false hasta que verifyAndActivateTOTP valide
    // el primer código. Un re-setup antes de activar sobrescribe el secreto.
    const secretCode = TotpUtil.generateSecret();
    // Etiqueta en la app autenticadora: sin username (token viejo) quedaba literalmente 'null'
    const otpauthUrl = TotpUtil.keyuri(username ?? userId, secretCode);

    await this.userRepository.update(userId, { totp_secret: EncryptionUtil.encrypt(secretCode) });

    logAudit('MFA_TOTP_SETUP', userId, { username }, { entityId: userId, ...ENTITY });

    return TOTPSetupResponseDTO({ otpauthUrl, secretCode, username });
  }

  async verifyAndActivateTOTP(totpCode: string, userId: string, username: string | null, firstName: string | null, auditContext: RequestAuditContext) {
    const user = await this.account.getUserSecure(userId);
    if (user.totp_enabled) {
      throw AppError.conflict('TOTP ya esta activado');
    }
    if (!user.totp_secret) {
      throw AppError.badRequest('Primero debes configurar TOTP');
    }

    // Verificar el código ANTES de abrir la transacción — no hay side effects externos que revertir.
    const secret = EncryptionUtil.decrypt(user.totp_secret);
    if (!TotpUtil.verify(totpCode, secret)) {
      throw AppError.badRequest('Codigo TOTP invalido');
    }

    const transaction = await this.unitOfWork.begin();

    try {
      await this.userRepository.updateTOTPStatus(userId, true, { transaction });

      // Primer MFA activado → queda como método preferido para que el login lo aplique
      if (user.preferred_mfa_method === 'none') {
        await this.userRepository.update(userId, { preferred_mfa_method: 'totp' }, { transaction });
      }

      await this.account.recordChange(
        {
          userId,
          changeType: 'mfa_status',
          previousValue: 'disabled',
          newValue: 'enabled',
          changeReason: 'MFA activado por cliente',
          auditContext
        },
        transaction
      );

      await transaction.commit();

      // TOTP activado — crítico, modifica seguridad de la cuenta
      logAudit('MFA_TOTP_ACTIVATED', userId, { username }, { entityId: userId, ...ENTITY });
      this._notify('TOTP_ACTIVADO', userId, firstName);

      return TOTPActivationResponseDTO({ userId, username, totpEnabled: true });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async verifyTOTP(totpCode: string, userId: string, username: string | null) {
    const user = await this.account.getUserSecure(userId);
    if (!user.totp_enabled) {
      throw AppError.badRequest('TOTP no esta activado para este usuario');
    }

    const secret = EncryptionUtil.decrypt(user.totp_secret);
    const isValid = TotpUtil.verify(totpCode, secret);

    // Registrar verificación — exitosa o fallida
    logAudit(
      isValid ? 'MFA_VERIFIED' : 'MFA_FAILED',
      userId,
      { username, success: isValid },
      { entityId: userId, ...ENTITY, outcome: isValid ? 'success' : 'failure' }
    );

    return TOTPVerificationResponseDTO({ valid: isValid, username });
  }

  async deactivateTOTP(password: string, userId: string, username: string | null, firstName: string | null, auditContext: RequestAuditContext) {
    const user = await this.account.getUserSecure(userId);
    if (!user.totp_enabled) {
      throw AppError.badRequest('TOTP no esta activado');
    }

    const isPasswordValid = await this.userRepository.verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      throw AppError.unauthorized('Contrasena incorrecta');
    }

    const transaction = await this.unitOfWork.begin();

    try {
      // Limpia el flag y BORRA el secreto en un solo update.
      await this.userRepository.setTOTPStatus(userId, false, null, { transaction });

      // Si TOTP era el método preferido, degradar para no dejar al login pidiendo
      // un factor que ya no existe: cae a SMS si está activo, si no a 'none'.
      if (user.preferred_mfa_method === 'totp') {
        await this.userRepository.update(
          userId,
          { preferred_mfa_method: user.sms_mfa_enabled ? 'sms' : 'none' },
          { transaction }
        );
      }

      await this.account.recordChange(
        {
          userId,
          changeType: 'mfa_status',
          previousValue: 'enabled',
          newValue: 'disabled',
          changeReason: 'MFA desactivado por cliente',
          auditContext
        },
        transaction
      );

      await transaction.commit();

      // TOTP desactivado — crítico, reduce seguridad de la cuenta
      logAudit('MFA_TOTP_DEACTIVATED', userId, { username }, { entityId: userId, ...ENTITY });
      this._notify('TOTP_ELIMINADO', userId, firstName);

      return TOTPActivationResponseDTO({ userId, username, totpEnabled: false });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /** @private — notificación fire-and-forget al usuario */
  _notify(tipoNotificacion: string, userId: string, firstName: string | null) {
    setImmediate(() => {
      this.NotificationUtil.crearNotificacion({
        tipoNotificacion,
        userId,
        relatedEntity: null,
        metadata: { nombre: firstName }
      }).catch(err => logger.warn(`Error enviando notificacion ${tipoNotificacion}`, { error: err.message, userId }));
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace TotpMfaService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    unitOfWork?: typeof unitOfWork;
    userRepository?: typeof userRepository;
    NotificationUtil?: typeof NotificationUtil;
    account?: InstanceType<typeof MfaAccount>;
  }
}

export = TotpMfaService;
