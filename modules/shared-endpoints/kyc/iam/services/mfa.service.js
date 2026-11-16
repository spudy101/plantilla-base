// modules/shared-endpoints/kyc/iam/services/mfa.service.js
//
// ============================================================
// MFA SERVICE — fachada
// ============================================================
// SOLID (S): TOTP y SMS son dos segundos factores independientes (cambian por razones distintas).
// Cada uno vive en su service (carpeta mfa/); aquí queda lo transversal a ambos:
//   - TotpMfaService  → setup / activación / verificación / baja de TOTP
//   - SmsMfaService   → código de activación / confirmación / baja de SMS MFA
//   - MfaAccount      → lecturas del usuario y bitácora de cambios de MFA
//   - (esta clase)    → estado, método preferido y validación de contraseña
// La API pública no cambia: controllers y tests siguen igual.
// ============================================================

const unitOfWork = require('../../../../../shared/database/unit-of-work');
const userRepository = require('../../../../schemas/kyc/iam/repositories/user.repository');
const verificationCodeRepository = require('../../../../schemas/notification/repositories/verification-code.repository');
const NotificationUtil = require('../../../../schemas/notification/services/notification-creation.service');
const SmsService = require('../../../../schemas/notification/services/sms.service');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logAudit } = require('../../../../../shared/utils/logger.util');
const { PasswordValidationResponseDTO, MFAStatusResponseDTO, PreferredMethodResponseDTO } = require('../dtos/mfa.dto');
const MfaAccount = require('./mfa/mfa-account');
const TotpMfaService = require('./mfa/totp-mfa.service');
const SmsMfaService = require('./mfa/sms-mfa.service');

const ENTITY = { entityType: 'User', entityTable: 'users' };

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

    // Sub-servicios por responsabilidad (SOLID: S). Reciben las mismas dependencias.
    const shared = {
      unitOfWork: this.unitOfWork,
      userRepository: this.userRepository,
      verificationCodeRepository: this.verificationCodeRepository,
      NotificationUtil: this.NotificationUtil,
      SmsService: this.SmsService
    };
    this.account = deps.account ?? new MfaAccount(shared);
    shared.account = this.account;
    this.totp = deps.totp ?? new TotpMfaService(shared);
    this.sms = deps.sms ?? new SmsMfaService(shared);
  }

  // ── TOTP → TotpMfaService ──
  setupTOTP(userId, username) {
    return this.totp.setupTOTP(userId, username);
  }

  verifyAndActivateTOTP(totpCode, userId, username, firstName, auditContext) {
    return this.totp.verifyAndActivateTOTP(totpCode, userId, username, firstName, auditContext);
  }

  verifyTOTP(totpCode, userId, username) {
    return this.totp.verifyTOTP(totpCode, userId, username);
  }

  deactivateTOTP(password, userId, username, firstName, auditContext) {
    return this.totp.deactivateTOTP(password, userId, username, firstName, auditContext);
  }

  // ── SMS → SmsMfaService ──
  requestSMSActivation(password, userId, username) {
    return this.sms.requestSMSActivation(password, userId, username);
  }

  confirmSMSActivation(code, userId, username, firstName, auditContext) {
    return this.sms.confirmSMSActivation(code, userId, username, firstName, auditContext);
  }

  deactivateSMSMFA(password, userId, username, firstName, auditContext) {
    return this.sms.deactivateSMSMFA(password, userId, username, firstName, auditContext);
  }

  // ── Transversal a ambos factores ──

  async validatePassword(password, userId, username) {
    const user = await this.account.getUserSecure(userId);
    const isValid = await this.userRepository.verifyPassword(password, user.password_hash);

    logAudit(
      'MFA_PASSWORD_VALIDATED',
      userId,
      { username, success: isValid },
      { entityId: userId, ...ENTITY, outcome: isValid ? 'success' : 'failure' }
    );

    return PasswordValidationResponseDTO({ valid: isValid, username });
  }

  async getStatus(userId, username) {
    const user = await this.account.getUserSecure(userId);
    logAudit('MFA_STATUS_VIEWED', userId, { username }, { entityId: userId, ...ENTITY });
    return MFAStatusResponseDTO({
      userId: user.user_id,
      username,
      totpEnabled: user.totp_enabled,
      smsMfaEnabled: user.sms_mfa_enabled ?? false,
      preferredMfaMethod: user.preferred_mfa_method ?? 'none'
    });
  }

  async updatePreferredMethod(preferredMethod, userId, username, auditContext) {
    const user = await this.account.getUserSecure(userId);

    if (preferredMethod === 'totp' && !user.totp_enabled) {
      throw AppError.badRequest('Debes activar TOTP antes de seleccionarlo como método preferido');
    }
    if (preferredMethod === 'sms' && !user.sms_mfa_enabled) {
      throw AppError.badRequest('Debes activar SMS MFA antes de seleccionarlo como método preferido');
    }

    const transaction = await this.unitOfWork.begin();

    try {
      // La preferencia de MFA vive solo en nuestra BD; el login la lee para decidir
      // qué segundo factor exigir.
      await this.userRepository.update(userId, { preferred_mfa_method: preferredMethod }, { transaction });

      await this.account.recordChange(
        {
          userId,
          changeType: 'preferred_mfa_method',
          previousValue: user.preferred_mfa_method,
          newValue: preferredMethod,
          changeReason: 'Método MFA preferido actualizado por cliente',
          auditContext
        },
        transaction
      );

      await transaction.commit();

      logAudit('MFA_PREFERRED_METHOD_UPDATED', userId, { username, preferredMethod }, { entityId: userId, ...ENTITY });

      return PreferredMethodResponseDTO({ userId, username, preferredMfaMethod: preferredMethod });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = new MFAService();
module.exports.MFAService = MFAService;
