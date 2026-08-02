const { sequelize } = require('../../../../shared/models');
const verificationCodeRepository = require('../../../schemas/notification/repositories/verification-code.repository');
const NotificationUtil = require('../../../schemas/notification/services/notification-creation.service');
const SmsService = require('../../../schemas/notification/services/sms.service');
const AppError = require('../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../shared/utils/logger.util');
const { notifications, MOCKS } = require('../../../../shared/constants');
const crypto = require('node:crypto');
const { SendVerificationResponseDTO, VerifyCodeResponseDTO } = require('../dtos/send-verification.dto');

// [RF-AUTH-01] | CA-02 | 🔄 MODIFICADO: CA-02 especifica
// TTL 24h. Implementado en 15 min por criterio de
// seguridad (OTP numérico en flujo activo).
// Pendiente: actualizar SRS v12.1.
const VERIFICATION_EXPIRATION_MINUTES = 15;
const MAX_VERIFICATION_ATTEMPTS = 5;
const VERIFICATION_CODE_MIN = 100000;
const VERIFICATION_CODE_MAX = 999999;
const MASKED_CODE_VISIBLE_DIGITS = 2;

class SendVerificationService {
  // ============================================================
  // ENVIAR CÓDIGO
  // ============================================================

  async sendVerificationCode(data) {
    const { type, contact, phonePrefixId } = data;

    const canRequest = await verificationCodeRepository.canRequestNewCode(type, contact);
    if (!canRequest) {
      throw AppError.tooManyRequests('Debes esperar 60 segundos antes de solicitar un nuevo código');
    }

    const code = this._generateCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRATION_MINUTES * 60 * 1000);

    const transaction = await sequelize.transaction();

    try {
      const verificationCode = await verificationCodeRepository.create(
        {
          type,
          contact_value: contact,
          code,
          attempts: 0,
          expires_at: expiresAt
        },
        { transaction }
      );

      await transaction.commit();

      // Ruta pública — userId = null (no hay sesión activa)
      logAudit(
        'VERIFICATION_CODE_SENT',
        null,
        {
          type,
          contact,
          expiresAt
        },
        { entityId: verificationCode.verification_code_id, entityType: 'VerificationCode', entityTable: 'verification_codes' }
      );

      setImmediate(() => {
        this._sendCode(type, contact, phonePrefixId, code).catch(err =>
          // El código no llegó al usuario: integración (SES/SMS) caída → solo el admin lo resuelve.
          logger.warn('Error sending verification code', {
            error: err.message,
            type,
            contact,
            codeId: verificationCode.verification_code_id
          })
        );
      });

      const truncatedCode = this._getTruncatedCode(type, code);
      return new SendVerificationResponseDTO({ verificationCode, truncatedCode });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // ============================================================
  // VERIFICAR CÓDIGO
  // ============================================================

  async verifyCode(data) {
    const { type, contact, code } = data;

    const verificationCode = await verificationCodeRepository.findActiveByContact(type, contact);

    if (!verificationCode) {
      logger.info('Verificación de código sin registro activo', { type, contact });
      throw AppError.notFound('Código de verificación no encontrado o expirado');
    }
    if (verificationCode.verified_at) {
      logger.info('Intento de reusar un código ya verificado', { type, contact });
      throw AppError.badRequest('Este código ya fue utilizado');
    }
    if (verificationCode.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      logger.info('Código bloqueado por exceso de intentos', { type, contact, attempts: verificationCode.attempts });
      throw AppError.forbidden('Excediste el número máximo de intentos. Solicita un nuevo código');
    }

    if (verificationCode.code !== code) {
      const transaction = await sequelize.transaction();
      try {
        await verificationCodeRepository.incrementAttempts(verificationCode.verification_code_id, {
          transaction
        });
        await transaction.commit();
      } catch (err) {
        if (!transaction.finished) {
          await transaction.rollback();
        }
        throw err;
      }

      // Evento de seguridad (mismo patrón que LOGIN_FAILED / MFA SMS fallido): se audita el
      // intento fallido con outcome=failure y datos (contact, attempts) que el middleware no captura.
      // Ruta pública → userId = null.
      logAudit(
        'VERIFICATION_CODE_FAILED',
        null,
        {
          type,
          contact,
          attempts: verificationCode.attempts + 1
        },
        {
          entityId: verificationCode.verification_code_id,
          entityType: 'VerificationCode',
          entityTable: 'verification_codes',
          outcome: 'failure'
        }
      );

      const remaining = MAX_VERIFICATION_ATTEMPTS - (verificationCode.attempts + 1);
      throw AppError.badRequest(`Código inválido. Te quedan ${remaining} intento${remaining !== 1 ? 's' : ''}`);
    }

    const transaction = await sequelize.transaction();
    try {
      await verificationCodeRepository.markAsVerified(verificationCode.verification_code_id, {
        transaction
      });
      await transaction.commit();
    } catch (err) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw err;
    }

    // Verificación exitosa — ruta pública, userId = null
    logAudit(
      'VERIFICATION_CODE_VERIFIED',
      null,
      {
        type,
        contact
      },
      { entityId: verificationCode.verification_code_id, entityType: 'VerificationCode', entityTable: 'verification_codes' }
    );

    return new VerifyCodeResponseDTO();
  }

  // ============================================================
  // PRIVATE
  // ============================================================

  /** @private */
  _generateCode() {
    if (MOCKS.EXTERNAL_PROVIDERS) {
      return '123456';
    }
    return crypto.randomInt(VERIFICATION_CODE_MIN, VERIFICATION_CODE_MAX).toString();
  }

  /** @private */
  _getTruncatedCode(type, code) {
    if (type === 'phone' || MOCKS.EXTERNAL_PROVIDERS) {
      return `****${code.slice(-MASKED_CODE_VISIBLE_DIGITS)}`;
    }
    return null;
  }

  /** @private */
  async _sendCode(type, contact, phonePrefixId, code) {
    if (type === 'email') {
      await NotificationUtil.crearNotificacionDirecta({
        tipoNotificacion: 'CODIGO_VERIFICACION',
        email: contact,
        metadata: {
          codigo: code,
          minutos: VERIFICATION_EXPIRATION_MINUTES,
          logoUrl: notifications.ses.logoUrl
        }
      });
      logger.info('Verification email sent', { email: contact });
    } else if (type === 'phone') {
      // SMS por AWS SNS. Se arma el E.164 con el prefijo del país (ej: +56) + el número local.
      const phoneNumber = await SmsService.resolveE164(contact, phonePrefixId);

      const result = await SmsService.enviarSmsOtp({
        phoneNumber,
        message: `Tu código de verificación es ${code}. Vence en ${VERIFICATION_EXPIRATION_MINUTES} minutos.`,
        purpose: 'otp_verification'
      });

      if (!result.success) {
        throw new Error(result.error || 'No se pudo enviar el SMS de verificación');
      }
      logger.info('SMS verification code sent', { phone: contact });
    }
  }
}

module.exports = new SendVerificationService();
