// modules/shared-endpoints/kyc/iam/services/auth-login/sms-login-challenge.service.js
//
// Desafío MFA por SMS en el login: emisión y verificación del código.
// Extraído de AuthLoginService (SOLID: S).

const crypto = require('node:crypto');
const userRepository = require('../../../../../schemas/kyc/iam/repositories/user.repository');
const userLoginAttemptRepository = require('../../../../../schemas/records/audit/repositories/user-login-attempt.repository');
const verificationCodeRepository = require('../../../../../schemas/notification/repositories/verification-code.repository');
const SmsService = require('../../../../../schemas/notification/services/sms.service');
const AppError = require('../../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../../shared/utils/logger.util');
const { MOCKS } = require('../../../../../../shared/constants');
const { MFARequiredResponseDTO } = require('../../dtos/auth-login.dto');

// ============================================================
// CONSTANTES
// ============================================================

const SMS_CHALLENGE_EXPIRY_MINUTES = 15;
const SMS_MAX_ATTEMPTS = 5;
const SMS_CODE_MIN = 100000;
const SMS_CODE_MAX = 999999;

class SmsLoginChallengeService {
  /**
   * @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada
   *   AuthLoginService; por defecto se usan las implementaciones reales.
   */
  constructor(deps = {}) {
    this.userRepository = deps.userRepository ?? userRepository;
    this.userLoginAttemptRepository = deps.userLoginAttemptRepository ?? userLoginAttemptRepository;
    this.verificationCodeRepository = deps.verificationCodeRepository ?? verificationCodeRepository;
    this.SmsService = deps.SmsService ?? SmsService;
  }

  // ============================================================
  // SMS MFA LOGIN CHALLENGE
  // ============================================================

  /** @private */
  async issue(user, nationalId) {
    const userWithPhone = await this.userRepository.findById(user.user_id, {
      include: [
        {
          association: 'person',
          attributes: ['person_id'],
          include: [{ association: 'contact', attributes: ['phone_primary', 'phone_primary_prefix_id'] }]
        }
      ]
    });

    const phone = userWithPhone?.person?.contact?.phone_primary;
    if (!phone) {
      throw AppError.badRequest('No tienes número de teléfono registrado para SMS MFA');
    }
    const phonePrefixId = userWithPhone?.person?.contact?.phone_primary_prefix_id ?? null;

    const canRequest = await this.verificationCodeRepository.canRequestNewCode('phone', phone);
    if (!canRequest) {
      throw AppError.tooManyRequests('Debes esperar antes de solicitar un nuevo código SMS');
    }

    const code = this._generateSmsCode();
    const expiresAt = new Date(Date.now() + SMS_CHALLENGE_EXPIRY_MINUTES * 60 * 1000);

    const verificationCode = await this.verificationCodeRepository.create({
      type: 'phone',
      contact_value: phone,
      code,
      attempts: 0,
      expires_at: expiresAt
    });

    // SMS por AWS SNS — envío no bloqueante (no debe demorar/tumbar el flujo de login).
    setImmediate(async () => {
      try {
        const phoneNumber = await this.SmsService.resolveE164(phone, phonePrefixId);
        const result = await this.SmsService.enviarSmsOtp({
          phoneNumber,
          message: `Tu código de verificación es ${code}. Vence en ${SMS_CHALLENGE_EXPIRY_MINUTES} minutos.`,
          userId: user.user_id,
          purpose: 'mfa_login'
        });
        if (!result.success) {
          logger.warn('SMS login challenge no enviado', { userId: user.user_id, error: result.error });
        }
      } catch (err) {
        logger.warn('Error enviando SMS login challenge', { userId: user.user_id, error: err.message });
      }
    });

    logAudit(
      'MFA_REQUIRED',
      user.user_id,
      { nationalId, challengeType: 'SMS_OTP' },
      { entityId: user.user_id, entityType: 'User', entityTable: 'users' }
    );

    return MFARequiredResponseDTO({
      username: user.auth_username,
      session: verificationCode.verification_code_id,
      challengeType: 'SMS_OTP',
      preferredMfaMethod: 'sms'
    });
  }

  /** @private */
  async verify(user, nationalId, code, { ip, userAgent, fingerprintHash }) {
    const userWithPhone = await this.userRepository.findById(user.user_id, {
      include: [
        {
          association: 'person',
          attributes: ['person_id'],
          include: [{ association: 'contact', attributes: ['phone_primary'] }]
        }
      ]
    });

    const phone = userWithPhone?.person?.contact?.phone_primary;
    if (!phone) {
      throw AppError.badRequest('No tienes número de teléfono registrado para SMS MFA');
    }

    const verificationCode = await this.verificationCodeRepository.findActiveByContact('phone', phone);
    if (!verificationCode || verificationCode.verified_at) {
      throw AppError.badRequest('Código SMS inválido o expirado');
    }

    if (verificationCode.attempts >= SMS_MAX_ATTEMPTS) {
      throw AppError.forbidden('Excediste el número máximo de intentos. Inicia sesión nuevamente');
    }

    if (verificationCode.code !== code) {
      await this.verificationCodeRepository.incrementAttempts(verificationCode.verification_code_id);

      await this.userLoginAttemptRepository.recordAttempt({
        user_id: user.user_id,
        username_attempt: user.auth_username,
        national_id: nationalId,
        ip_address: ip,
        user_agent: userAgent,
        device_fingerprint: fingerprintHash,
        success: false,
        failure_reason: 'Codigo SMS incorrecto',
        attempted_at: new Date()
      });

      // Evento forense de seguridad (Opción A): se mantiene pese al log genérico del
      // middleware al propagar el throw. El intento queda en user_login_attempts.
      logAudit(
        'MFA_FAILED',
        user.user_id,
        { nationalId, reason: 'Codigo SMS incorrecto' },
        { entityId: user.user_id, entityType: 'User', entityTable: 'users', outcome: 'failure' }
      );

      const remaining = SMS_MAX_ATTEMPTS - (verificationCode.attempts + 1);
      throw AppError.badRequest(`Código SMS incorrecto. Te quedan ${remaining} intento(s)`);
    }

    await this.verificationCodeRepository.markAsVerified(verificationCode.verification_code_id);
  }

  /** @private */
  _generateSmsCode() {
    if (MOCKS.EXTERNAL_PROVIDERS) {
      return '123456';
    }
    return String(crypto.randomInt(SMS_CODE_MIN, SMS_CODE_MAX + 1));
  }
}

module.exports = SmsLoginChallengeService;
