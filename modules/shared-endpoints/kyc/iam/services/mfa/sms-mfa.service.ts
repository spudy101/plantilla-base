import type defineUser from '../../../../../schemas/kyc/iam/models/user.model';
// modules/shared-endpoints/kyc/iam/services/mfa/sms-mfa.service.ts
//
// Segundo factor por SMS: solicitud de código de activación, confirmación y baja.
// Extraído de MFAService (SOLID: S).

import type { RequestAuditContext } from '../../../../../../shared/types/audit-context';
import crypto from 'node:crypto';
import unitOfWork from '../../../../../../shared/database/unit-of-work';
import userRepository from '../../../../../schemas/kyc/iam/repositories/user.repository';
import verificationCodeRepository from '../../../../../schemas/notification/repositories/verification-code.repository';
import NotificationUtil from '../../../../../schemas/notification/services/notification-creation.service';
import SmsService from '../../../../../schemas/notification/services/sms.service';
import AppError from '../../../../../../shared/utils/app-error.util';
import loggerUtilModule from '../../../../../../shared/utils/logger.util';
const { logger, logAudit } = loggerUtilModule;
import constantsModule from '../../../../../../shared/constants';
const { MOCKS } = constantsModule;
import mfaDtoModule from '../../dtos/mfa.dto';
const { SMSMFAActivationResponseDTO, SMSActivationRequestResponseDTO } = mfaDtoModule;
import MfaAccount from './mfa-account';
import errorMessageModule from '../../../../../../shared/utils/error-message.util';

const { errorMessage } = errorMessageModule;


const OTP_EXPIRATION_MINUTES = 15;
const MAX_OTP_ATTEMPTS = 5;
const OTP_CODE_MIN = 100000;
const OTP_CODE_MAX = 999999;
const MASKED_CODE_VISIBLE_DIGITS = 2;
const MS_PER_MINUTE = 60 * 1000;

const ENTITY = { entityType: 'User', entityTable: 'users' };

class SmsMfaService {
  unitOfWork: typeof unitOfWork;
  userRepository: typeof userRepository;
  verificationCodeRepository: typeof verificationCodeRepository;
  NotificationUtil: typeof NotificationUtil;
  SmsService: typeof SmsService;
  account: InstanceType<typeof MfaAccount>;

  /** @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada MFAService. */
  constructor(deps: SmsMfaService.Deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.userRepository = deps.userRepository ?? userRepository;
    this.verificationCodeRepository = deps.verificationCodeRepository ?? verificationCodeRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
    this.SmsService = deps.SmsService ?? SmsService;
    this.account = deps.account ?? new MfaAccount(deps);
  }

  async requestSMSActivation(password: string, userId: string, username: string | null) {
    const user = await this.account.getUserWithPhone(userId);
    if (user.sms_mfa_enabled) {
      throw AppError.conflict('SMS MFA ya está activado para este usuario');
    }

    await this.account.assertPassword(user, password);

    const phone = this._requirePhone(user);

    const canRequest = await this.verificationCodeRepository.canRequestNewCode('phone', phone);
    if (!canRequest) {
      throw AppError.tooManyRequests('Debes esperar 60 segundos antes de solicitar un nuevo código');
    }

    const code = this._generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * MS_PER_MINUTE);

    const verificationCode = await this.verificationCodeRepository.create({
      type: 'phone',
      contact_value: phone,
      code,
      expires_at: expiresAt
    });

    this._sendActivationSms(userId, phone, user.person?.contact?.phone_primary_prefix_id ?? null, code);

    logAudit('MFA_SMS_SETUP', userId, { username }, { entityId: userId, ...ENTITY });

    const truncatedCode = `****${code.slice(-MASKED_CODE_VISIBLE_DIGITS)}`;
    return SMSActivationRequestResponseDTO({
      verificationCodeId: verificationCode.verification_code_id,
      expiresAt,
      truncatedCode
    });
  }

  async confirmSMSActivation(code: string, userId: string, username: string | null, firstName: string | null, auditContext: RequestAuditContext) {
    const user = await this.account.getUserWithPhone(userId);
    if (user.sms_mfa_enabled) {
      throw AppError.conflict('SMS MFA ya está activado');
    }

    const phone = this._requirePhone(user);
    const verificationCode = await this._assertValidCode(phone, code);

    const transaction = await this.unitOfWork.begin();

    try {
      await this.verificationCodeRepository.markAsVerified(verificationCode.verification_code_id, { transaction });
      // SMS MFA gestionado íntegramente en nuestra BD
      const updates: Partial<defineUser.Attributes> = { sms_mfa_enabled: true };
      // Primer MFA activado → queda como método preferido para que el login dispare el SMS
      if (user.preferred_mfa_method === 'none') {
        updates.preferred_mfa_method = 'sms';
      }
      await this.userRepository.update(userId, updates, { transaction });

      await this.account.recordChange(
        {
          userId,
          changeType: 'sms_mfa_status',
          previousValue: 'disabled',
          newValue: 'enabled',
          changeReason: 'SMS MFA activado por cliente',
          auditContext
        },
        transaction
      );

      await transaction.commit();

      logAudit('MFA_SMS_ACTIVATED', userId, { username }, { entityId: userId, ...ENTITY });
      this._notify('SMS_MFA_ACTIVADO', userId, firstName);

      return SMSMFAActivationResponseDTO({ userId, username, smsMfaEnabled: true });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async deactivateSMSMFA(password: string, userId: string, username: string | null, firstName: string | null, auditContext: RequestAuditContext) {
    const user = await this.account.getUserSecure(userId);
    if (!user.sms_mfa_enabled) {
      throw AppError.badRequest('SMS MFA no está activado');
    }

    await this.account.assertPassword(user, password);

    const transaction = await this.unitOfWork.begin();

    try {
      // SMS MFA gestionado íntegramente en nuestra BD
      const updates: Partial<defineUser.Attributes> = { sms_mfa_enabled: false };
      if (user.preferred_mfa_method === 'sms') {
        updates.preferred_mfa_method = user.totp_enabled ? 'totp' : 'none';
      }
      await this.userRepository.update(userId, updates, { transaction });

      await this.account.recordChange(
        {
          userId,
          changeType: 'sms_mfa_status',
          previousValue: 'enabled',
          newValue: 'disabled',
          changeReason: 'SMS MFA desactivado por cliente',
          auditContext
        },
        transaction
      );

      await transaction.commit();

      logAudit('MFA_SMS_DEACTIVATED', userId, { username }, { entityId: userId, ...ENTITY });
      this._notify('SMS_MFA_DESACTIVADO', userId, firstName);

      return SMSMFAActivationResponseDTO({ userId, username, smsMfaEnabled: false });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // ============================================================
  // PRIVATE
  // ============================================================

  /** @private */
  _requirePhone(user: defineUser.Instance) {
    const phone = user.person?.contact?.phone_primary;
    if (!phone) {
      throw AppError.badRequest('Debes registrar un número de teléfono antes de activar SMS MFA');
    }
    return phone;
  }

  /** @private — valida el código vigente del teléfono (existencia, uso, intentos y valor). */
  async _assertValidCode(phone: string, code: string) {
    const verificationCode = await this.verificationCodeRepository.findActiveByContact('phone', phone);
    if (!verificationCode) {
      throw AppError.notFound('Código de verificación no encontrado o expirado');
    }
    if (verificationCode.verified_at) {
      throw AppError.badRequest('Este código ya fue utilizado');
    }
    const attempts = verificationCode.attempts ?? 0;
    if (attempts >= MAX_OTP_ATTEMPTS) {
      throw AppError.forbidden('Excediste el número máximo de intentos. Solicita un nuevo código');
    }
    if (verificationCode.code !== code) {
      await this.verificationCodeRepository.incrementAttempts(verificationCode.verification_code_id);
      const remaining = MAX_OTP_ATTEMPTS - (attempts + 1);
      throw AppError.badRequest(`Código inválido. Te quedan ${remaining} intento${remaining !== 1 ? 's' : ''}`);
    }
    return verificationCode;
  }

  /** @private — SMS por AWS SNS, envío no bloqueante del código de activación. */
  _sendActivationSms(userId: string, phone: string, phonePrefixId: string | null, code: string) {
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
        logger.warn('Error enviando SMS MFA activation code', { userId, error: errorMessage(err) });
      }
    });
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

  /** @private */
  _generateOtpCode() {
    if (MOCKS.EXTERNAL_PROVIDERS) {
      return '123456';
    }
    return crypto.randomInt(OTP_CODE_MIN, OTP_CODE_MAX).toString();
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace SmsMfaService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    unitOfWork?: typeof unitOfWork;
    userRepository?: typeof userRepository;
    verificationCodeRepository?: typeof verificationCodeRepository;
    NotificationUtil?: typeof NotificationUtil;
    SmsService?: typeof SmsService;
    account?: InstanceType<typeof MfaAccount>;
  }
}

export default SmsMfaService;
