import type defineUser = require('../../../../schemas/kyc/iam/models/user.model');
// modules/shared-endpoints/kyc/iam/services/mfa.service.ts
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

import type { RequestAuditContext } from '../../../../../shared/types/audit-context';
import unitOfWork = require('../../../../../shared/database/unit-of-work');
import userRepository = require('../../../../schemas/kyc/iam/repositories/user.repository');
import verificationCodeRepository = require('../../../../schemas/notification/repositories/verification-code.repository');
import NotificationUtil = require('../../../../schemas/notification/services/notification-creation.service');
import SmsService = require('../../../../schemas/notification/services/sms.service');
import AppError = require('../../../../../shared/utils/app-error.util');
import loggerUtilModule = require('../../../../../shared/utils/logger.util');
const { logAudit } = loggerUtilModule;
import mfaDtoModule = require('../dtos/mfa.dto');
const { PasswordValidationResponseDTO, MFAStatusResponseDTO, PreferredMethodResponseDTO } = mfaDtoModule;
import MfaAccount = require('./mfa/mfa-account');
import TotpMfaService = require('./mfa/totp-mfa.service');
import SmsMfaService = require('./mfa/sms-mfa.service');

const ENTITY = { entityType: 'User', entityTable: 'users' };

class MFAService {
  unitOfWork: typeof unitOfWork;
  userRepository: typeof userRepository;
  verificationCodeRepository: typeof verificationCodeRepository;
  NotificationUtil: typeof NotificationUtil;
  SmsService: typeof SmsService;
  account: InstanceType<typeof MfaAccount>;
  totp: InstanceType<typeof TotpMfaService>;
  sms: InstanceType<typeof SmsMfaService>;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new MFAService({ unitOfWork: fake })
   * @param {object} [deps]
   */
  constructor(deps: MFAService.Deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.userRepository = deps.userRepository ?? userRepository;
    this.verificationCodeRepository = deps.verificationCodeRepository ?? verificationCodeRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
    this.SmsService = deps.SmsService ?? SmsService;

    // Sub-servicios por responsabilidad (SOLID: S). Reciben las mismas dependencias.
    const shared: TotpMfaService.Deps & SmsMfaService.Deps = {
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
  setupTOTP(userId: string, username: string | null) {
    return this.totp.setupTOTP(userId, username);
  }

  verifyAndActivateTOTP(totpCode: string, userId: string, username: string | null, firstName: string | null, auditContext: RequestAuditContext) {
    return this.totp.verifyAndActivateTOTP(totpCode, userId, username, firstName, auditContext);
  }

  verifyTOTP(totpCode: string, userId: string, username: string | null) {
    return this.totp.verifyTOTP(totpCode, userId, username);
  }

  deactivateTOTP(password: string, userId: string, username: string | null, firstName: string | null, auditContext: RequestAuditContext) {
    return this.totp.deactivateTOTP(password, userId, username, firstName, auditContext);
  }

  // ── SMS → SmsMfaService ──
  requestSMSActivation(password: string, userId: string, username: string | null) {
    return this.sms.requestSMSActivation(password, userId, username);
  }

  confirmSMSActivation(code: string, userId: string, username: string | null, firstName: string | null, auditContext: RequestAuditContext) {
    return this.sms.confirmSMSActivation(code, userId, username, firstName, auditContext);
  }

  deactivateSMSMFA(password: string, userId: string, username: string | null, firstName: string | null, auditContext: RequestAuditContext) {
    return this.sms.deactivateSMSMFA(password, userId, username, firstName, auditContext);
  }

  // ── Transversal a ambos factores ──

  async validatePassword(password: string, userId: string, username: string | null) {
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

  async getStatus(userId: string, username: string | null) {
    const user = await this.account.getUserSecure(userId);
    logAudit('MFA_STATUS_VIEWED', userId, { username }, { entityId: userId, ...ENTITY });
    return MFAStatusResponseDTO({
      userId: user.user_id,
      username,
      totpEnabled: user.totp_enabled ?? false,
      smsMfaEnabled: user.sms_mfa_enabled ?? false,
      preferredMfaMethod: user.preferred_mfa_method ?? 'none'
    });
  }

  async updatePreferredMethod(preferredMethod: defineUser.Attributes['preferred_mfa_method'], userId: string, username: string | null, auditContext: RequestAuditContext) {
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

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace MFAService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    unitOfWork?: typeof unitOfWork;
    userRepository?: typeof userRepository;
    verificationCodeRepository?: typeof verificationCodeRepository;
    NotificationUtil?: typeof NotificationUtil;
    SmsService?: typeof SmsService;
    account?: InstanceType<typeof MfaAccount>;
    totp?: InstanceType<typeof TotpMfaService>;
    sms?: InstanceType<typeof SmsMfaService>;
  }
}

export = Object.assign(new MFAService(), { MFAService });
