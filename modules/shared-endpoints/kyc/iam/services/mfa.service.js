const unitOfWork = require('../../../../../shared/database/unit-of-work');
const userRepository = require('../../../../schemas/kyc/iam/repositories/user.repository');
const verificationCodeRepository = require('../../../../schemas/notification/repositories/verification-code.repository');
const KycSharedUtil = require('../../../../schemas/kyc/person/utils/kyc-shared.util');
const TotpUtil = require('../../../../../shared/utils/totp.util');
const EncryptionUtil = require('../../../../../shared/utils/encryption.util');
const NotificationUtil = require('../../../../schemas/notification/services/notification-creation.service');
const SmsService = require('../../../../schemas/notification/services/sms.service');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../shared/utils/logger.util');
const { MOCKS } = require('../../../../../shared/constants');
const crypto = require('node:crypto');
const {
  TOTPSetupResponseDTO,
  TOTPActivationResponseDTO,
  TOTPVerificationResponseDTO,
  PasswordValidationResponseDTO,
  SMSMFAActivationResponseDTO,
  SMSActivationRequestResponseDTO,
  MFAStatusResponseDTO,
  PreferredMethodResponseDTO
} = require('../dtos/mfa.dto');

const OTP_EXPIRATION_MINUTES = 15;
const MAX_OTP_ATTEMPTS = 5;
const OTP_CODE_MIN = 100000;
const OTP_CODE_MAX = 999999;
const MASKED_CODE_VISIBLE_DIGITS = 2;

class MFAService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new MFAService({ unitOfWork: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.userRepository = deps.userRepository ?? userRepository;
    this.verificationCodeRepository = deps.verificationCodeRepository ?? verificationCodeRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
    this.SmsService = deps.SmsService ?? SmsService;
  }

  async setupTOTP(userId, username) {
    const user = await this._getUserSecure(userId);
    if (user.totp_enabled) {
      throw AppError.conflict('TOTP ya esta activado para este usuario');
    }

    // Generamos el secreto nosotros (RFC 6238) y lo persistimos CIFRADO. Aún no
    // se activa: totp_enabled sigue false hasta que verifyAndActivateTOTP valide
    // el primer código. Un re-setup antes de activar sobrescribe el secreto.
    const secretCode = TotpUtil.generateSecret();
    const otpauthUrl = TotpUtil.keyuri(username, secretCode);

    await this.userRepository.update(userId, { totp_secret: EncryptionUtil.encrypt(secretCode) });

    logAudit('MFA_TOTP_SETUP', userId, { username }, { entityId: userId, entityType: 'User', entityTable: 'users' });

    return TOTPSetupResponseDTO({ otpauthUrl, secretCode, username });
  }

  async verifyAndActivateTOTP(totpCode, userId, username, firstName, auditContext) {
    const user = await this._getUserSecure(userId);
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

      await KycSharedUtil.logChange(
        {
          userId,
          changedByUserId: userId,
          changedByRole: 'user',
          changeType: 'mfa_status',
          previousValue: 'disabled',
          newValue: 'enabled',
          changeReason: 'MFA activado por cliente',
          ipAddress: auditContext.ip,
          userAgent: auditContext.userAgent
        },
        { transaction }
      );

      await transaction.commit();

      // TOTP activado — crítico, modifica seguridad de la cuenta
      logAudit('MFA_TOTP_ACTIVATED', userId, { username }, { entityId: userId, entityType: 'User', entityTable: 'users' });

      setImmediate(() => {
        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'TOTP_ACTIVADO',
          userId: userId,
          relatedEntity: null,
          metadata: { nombre: firstName }
        }).catch(err => logger.warn('Error enviando notificacion TOTP activado', { error: err.message, userId }));
      });

      return TOTPActivationResponseDTO({ userId, username, totpEnabled: true });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async verifyTOTP(totpCode, userId, username) {
    const user = await this._getUserSecure(userId);
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
      { entityId: userId, entityType: 'User', entityTable: 'users', outcome: isValid ? 'success' : 'failure' }
    );

    return TOTPVerificationResponseDTO({ valid: isValid, username });
  }

  async deactivateTOTP(password, userId, username, firstName, auditContext) {
    const user = await this._getUserSecure(userId);
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

      await KycSharedUtil.logChange(
        {
          userId,
          changedByUserId: userId,
          changedByRole: 'user',
          changeType: 'mfa_status',
          previousValue: 'enabled',
          newValue: 'disabled',
          changeReason: 'MFA desactivado por cliente',
          ipAddress: auditContext.ip,
          userAgent: auditContext.userAgent
        },
        { transaction }
      );

      await transaction.commit();

      // TOTP desactivado — crítico, reduce seguridad de la cuenta
      logAudit('MFA_TOTP_DEACTIVATED', userId, { username }, { entityId: userId, entityType: 'User', entityTable: 'users' });

      setImmediate(() => {
        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'TOTP_ELIMINADO',
          userId: userId,
          relatedEntity: null,
          metadata: { nombre: firstName }
        }).catch(err => logger.warn('Error enviando notificacion TOTP eliminado', { error: err.message, userId }));
      });

      return TOTPActivationResponseDTO({ userId, username, totpEnabled: false });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async validatePassword(password, userId, username) {
    const user = await this._getUserSecure(userId);
    const isValid = await this.userRepository.verifyPassword(password, user.password_hash);

    logAudit(
      'MFA_PASSWORD_VALIDATED',
      userId,
      { username, success: isValid },
      { entityId: userId, entityType: 'User', entityTable: 'users', outcome: isValid ? 'success' : 'failure' }
    );

    return PasswordValidationResponseDTO({ valid: isValid, username });
  }

  async getStatus(userId, username) {
    const user = await this._getUserSecure(userId);
    logAudit('MFA_STATUS_VIEWED', userId, { username }, { entityId: userId, entityType: 'User', entityTable: 'users' });
    return MFAStatusResponseDTO({
      userId: user.user_id,
      username,
      totpEnabled: user.totp_enabled,
      smsMfaEnabled: user.sms_mfa_enabled ?? false,
      preferredMfaMethod: user.preferred_mfa_method ?? 'none'
    });
  }

  async requestSMSActivation(password, userId, username) {
    const user = await this._getUserWithPhone(userId);
    if (user.sms_mfa_enabled) {
      throw AppError.conflict('SMS MFA ya está activado para este usuario');
    }

    const isPasswordValid = await this.userRepository.verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      throw AppError.unauthorized('Contraseña incorrecta');
    }

    const phone = user.person?.contact?.phone_primary;
    if (!phone) {
      throw AppError.badRequest('Debes registrar un número de teléfono antes de activar SMS MFA');
    }

    const canRequest = await this.verificationCodeRepository.canRequestNewCode('phone', phone);
    if (!canRequest) {
      throw AppError.tooManyRequests('Debes esperar 60 segundos antes de solicitar un nuevo código');
    }

    const code = this._generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000);

    const verificationCode = await this.verificationCodeRepository.create({
      type: 'phone',
      contact_value: phone,
      code,
      attempts: 0,
      expires_at: expiresAt
    });

    // SMS por AWS SNS — envío no bloqueante del código de activación.
    const phonePrefixId = user.person?.contact?.phone_primary_prefix_id ?? null;
    setImmediate(async () => {
      try {
        const phoneNumber = await this.SmsService.resolveE164(phone, phonePrefixId);
        const result = await this.SmsService.enviarSmsOtp({
          phoneNumber,
          message: `Tu código de activación de SMS MFA es ${code}. Vence en ${OTP_EXPIRATION_MINUTES} minutos.`,
          userId,
          purpose: 'mfa_setup'
        });
        if (!result.success) {
          logger.warn('SMS MFA activation code no enviado', { userId, error: result.error });
        }
      } catch (err) {
        logger.warn('Error enviando SMS MFA activation code', { userId, error: err.message });
      }
    });

    logAudit('MFA_SMS_SETUP', userId, { username }, { entityId: userId, entityType: 'User', entityTable: 'users' });

    const truncatedCode = `****${code.slice(-MASKED_CODE_VISIBLE_DIGITS)}`;
    return SMSActivationRequestResponseDTO({
      verificationCodeId: verificationCode.verification_code_id,
      expiresAt,
      truncatedCode
    });
  }

  async confirmSMSActivation(code, userId, username, firstName, auditContext) {
    const user = await this._getUserWithPhone(userId);
    if (user.sms_mfa_enabled) {
      throw AppError.conflict('SMS MFA ya está activado');
    }

    const phone = user.person?.contact?.phone_primary;
    if (!phone) {
      throw AppError.badRequest('Debes registrar un número de teléfono antes de activar SMS MFA');
    }

    const verificationCode = await this.verificationCodeRepository.findActiveByContact('phone', phone);
    if (!verificationCode) {
      throw AppError.notFound('Código de verificación no encontrado o expirado');
    }
    if (verificationCode.verified_at) {
      throw AppError.badRequest('Este código ya fue utilizado');
    }
    if (verificationCode.attempts >= MAX_OTP_ATTEMPTS) {
      throw AppError.forbidden('Excediste el número máximo de intentos. Solicita un nuevo código');
    }

    if (verificationCode.code !== code) {
      await this.verificationCodeRepository.incrementAttempts(verificationCode.verification_code_id);
      const remaining = MAX_OTP_ATTEMPTS - (verificationCode.attempts + 1);
      throw AppError.badRequest(`Código inválido. Te quedan ${remaining} intento${remaining !== 1 ? 's' : ''}`);
    }

    const transaction = await this.unitOfWork.begin();

    try {
      await this.verificationCodeRepository.markAsVerified(verificationCode.verification_code_id, {
        transaction
      });
      // SMS MFA gestionado íntegramente en nuestra BD
      const updates = { sms_mfa_enabled: true };
      // Primer MFA activado → queda como método preferido para que el login dispare el SMS
      if (user.preferred_mfa_method === 'none') {
        updates.preferred_mfa_method = 'sms';
      }
      await this.userRepository.update(userId, updates, { transaction });

      await KycSharedUtil.logChange(
        {
          userId,
          changedByUserId: userId,
          changedByRole: 'user',
          changeType: 'sms_mfa_status',
          previousValue: 'disabled',
          newValue: 'enabled',
          changeReason: 'SMS MFA activado por cliente',
          ipAddress: auditContext.ip,
          userAgent: auditContext.userAgent
        },
        { transaction }
      );

      await transaction.commit();

      logAudit('MFA_SMS_ACTIVATED', userId, { username }, { entityId: userId, entityType: 'User', entityTable: 'users' });

      setImmediate(() => {
        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'SMS_MFA_ACTIVADO',
          userId,
          relatedEntity: null,
          metadata: { nombre: firstName }
        }).catch(err =>
          logger.warn('Error enviando notificacion SMS MFA activado', {
            error: err.message,
            userId
          })
        );
      });

      return SMSMFAActivationResponseDTO({ userId, username, smsMfaEnabled: true });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async deactivateSMSMFA(password, userId, username, firstName, auditContext) {
    const user = await this._getUserSecure(userId);
    if (!user.sms_mfa_enabled) {
      throw AppError.badRequest('SMS MFA no está activado');
    }

    const isPasswordValid = await this.userRepository.verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      throw AppError.unauthorized('Contraseña incorrecta');
    }

    const transaction = await this.unitOfWork.begin();

    try {
      // SMS MFA gestionado íntegramente en nuestra BD
      const updates = { sms_mfa_enabled: false };
      if (user.preferred_mfa_method === 'sms') {
        updates.preferred_mfa_method = user.totp_enabled ? 'totp' : 'none';
      }
      await this.userRepository.update(userId, updates, { transaction });

      await KycSharedUtil.logChange(
        {
          userId,
          changedByUserId: userId,
          changedByRole: 'user',
          changeType: 'sms_mfa_status',
          previousValue: 'enabled',
          newValue: 'disabled',
          changeReason: 'SMS MFA desactivado por cliente',
          ipAddress: auditContext.ip,
          userAgent: auditContext.userAgent
        },
        { transaction }
      );

      await transaction.commit();

      logAudit('MFA_SMS_DEACTIVATED', userId, { username }, { entityId: userId, entityType: 'User', entityTable: 'users' });

      setImmediate(() => {
        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'SMS_MFA_DESACTIVADO',
          userId,
          relatedEntity: null,
          metadata: { nombre: firstName }
        }).catch(err =>
          logger.warn('Error enviando notificacion SMS MFA desactivado', {
            error: err.message,
            userId
          })
        );
      });

      return SMSMFAActivationResponseDTO({ userId, username, smsMfaEnabled: false });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async updatePreferredMethod(preferredMethod, userId, username, auditContext) {
    const user = await this._getUserSecure(userId);

    if (preferredMethod === 'totp' && !user.totp_enabled) {
      throw AppError.badRequest('Debes activar TOTP antes de seleccionarlo como método preferido');
    }
    if (preferredMethod === 'sms' && !user.sms_mfa_enabled) {
      throw AppError.badRequest('Debes activar SMS MFA antes de seleccionarlo como método preferido');
    }

    const transaction = await this.unitOfWork.begin();

    try {
      // La preferencia de MFA vive solo en nuestra BD; el login la lee para decidir
      // qué segundo factor exigir. Ya no hay que sincronizar con ningún proveedor externo.
      await this.userRepository.update(userId, { preferred_mfa_method: preferredMethod }, { transaction });

      await KycSharedUtil.logChange(
        {
          userId,
          changedByUserId: userId,
          changedByRole: 'user',
          changeType: 'preferred_mfa_method',
          previousValue: user.preferred_mfa_method,
          newValue: preferredMethod,
          changeReason: 'Método MFA preferido actualizado por cliente',
          ipAddress: auditContext.ip,
          userAgent: auditContext.userAgent
        },
        { transaction }
      );

      await transaction.commit();

      logAudit(
        'MFA_PREFERRED_METHOD_UPDATED',
        userId,
        { username, preferredMethod },
        { entityId: userId, entityType: 'User', entityTable: 'users' }
      );

      return PreferredMethodResponseDTO({ userId, username, preferredMfaMethod: preferredMethod });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /** @private */
  async _getUserSecure(userId) {
    const user = await this.userRepository.findById(userId, { include: [] });
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }
    return user;
  }

  /** @private */
  async _getUserWithPhone(userId) {
    const user = await this.userRepository.findById(userId, {
      include: [
        {
          association: 'person',
          attributes: ['person_id'],
          include: [{ association: 'contact', attributes: ['phone_primary', 'phone_primary_prefix_id'] }]
        }
      ]
    });
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }
    return user;
  }

  /** @private */
  _generateOtpCode() {
    if (MOCKS.EXTERNAL_PROVIDERS) {
      return '123456';
    }
    return crypto.randomInt(OTP_CODE_MIN, OTP_CODE_MAX).toString();
  }
}

module.exports = new MFAService();
module.exports.MFAService = MFAService;
