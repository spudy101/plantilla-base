import type defineUser = require('../../../../../schemas/kyc/iam/models/user.model');
import type definePrivacyPolicy = require('../../../../../schemas/records/legal/models/privacy-policy.model');
// modules/shared-endpoints/kyc/iam/services/auth-login/login-policy-gate.service.ts
//
// Compuerta de política de privacidad en el login. La comparten el login por contraseña y el
// biométrico (antes estaba copiada en ambos). Extraído por SOLID: S.

import userRepository = require('../../../../../schemas/kyc/iam/repositories/user.repository');
import privacyPolicyRepository = require('../../../../../schemas/records/legal/repositories/privacy-policy.repository');
import consentRecorder = require('../../../../../schemas/records/legal/services/consent-recorder.service');
import loggerUtilModule = require('../../../../../../shared/utils/logger.util');
const { logger, logAudit } = loggerUtilModule;
import constantsModule = require('../../../../../../shared/constants');
const { INTERNAL_ROLE_NAMES } = constantsModule;
import authLoginDtoModule = require('../../dtos/auth-login.dto');
const { PolicyUpdateRequiredDTO } = authLoginDtoModule;

class LoginPolicyGateService {
  userRepository: typeof userRepository;
  privacyPolicyRepository: typeof privacyPolicyRepository;
  consentRecorder: typeof consentRecorder;

  /**
   * @param {object} [deps] Dependencias inyectables (SOLID: D).
   */
  constructor(deps: LoginPolicyGateService.Deps = {}) {
    this.userRepository = deps.userRepository ?? userRepository;
    this.privacyPolicyRepository = deps.privacyPolicyRepository ?? privacyPolicyRepository;
    this.consentRecorder = deps.consentRecorder ?? consentRecorder;
  }

  /**
   * Verifica si el usuario tiene la versión activa de la política de privacidad.
   * Si el request trae `acceptPolicy: true`, registra la versión activa y deja continuar
   * el login en un solo paso.
   *
   * @param {Object} user
   * @param {boolean} acceptPolicy - true si el usuario aceptó la política en este request
   * @param {string|null} ip
   * @param {{ blockedAuditAction: string, source: string }} context
   *   blockedAuditAction: acción de auditoría al bloquear (p. ej. LOGIN_BLOCKED_POLICY_UPDATE)
   *   source: origen para los logs (p. ej. 'auth-login', 'auth-biometric')
   * @returns {Promise<null|Object>} null → el login continúa; PolicyUpdateRequiredDTO → bloqueado
   */
  async check(
    user: defineUser.Instance,
    acceptPolicy: boolean | undefined,
    ip: string | null,
    { blockedAuditAction, source }: { blockedAuditAction: string; source: string }
  ) {
    const activePolicy = await this.privacyPolicyRepository.findActive();

    // Los usuarios internos no están sujetos a la política de privacidad de clientes.
    if (user.role && INTERNAL_ROLE_NAMES.includes(user.role.name)) {
      return null;
    }
    // Sin política activa configurada → dejamos pasar
    if (!activePolicy) {
      return null;
    }
    // Ya tiene la versión activa → OK
    if (user.privacy_policy_version === activePolicy.version) {
      return null;
    }

    if (acceptPolicy === true) {
      await this._accept(user, activePolicy, ip, source);
      return null;
    }

    logAudit(
      blockedAuditAction,
      user.user_id,
      {
        userVersion: user.privacy_policy_version || 'ninguna',
        activeVersion: activePolicy.version
      },
      { entityType: 'PrivacyPolicy', entityTable: 'privacy_policies', outcome: 'failure' }
    );

    return PolicyUpdateRequiredDTO({
      currentVersion: user.privacy_policy_version || null,
      newVersion: activePolicy.version,
      documentUrl: activePolicy.document_url,
      summary: activePolicy.summary,
      effectiveDate: activePolicy.effective_date
    });
  }

  /** @private — el cliente aceptó en este mismo request: registrar y dejar pasar */
  async _accept(user: defineUser.Instance, activePolicy: definePrivacyPolicy.Instance, ip: string | null, source: string) {
    await this.userRepository.updatePrivacyPolicy(user.user_id, {
      version: activePolicy.version,
      acceptedAt: new Date(),
      acceptedIp: ip || null
    });

    // RF-ADM-04: trazabilidad granular en user_consents (best-effort)
    await this.consentRecorder
      .grantPrivacyPolicy({ userId: user.user_id, privacyPolicyId: activePolicy.privacy_policy_id, ip })
      .catch(err =>
        logger.warn(`${source}: no se pudo registrar user_consent de privacy policy`, {
          userId: user.user_id,
          error: err.message
        })
      );

    logAudit(
      'PRIVACY_POLICY_ACCEPTED',
      user.user_id,
      { version: activePolicy.version, ip: ip || null },
      { entityType: 'PrivacyPolicy', entityTable: 'privacy_policies' }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace LoginPolicyGateService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    userRepository?: typeof userRepository;
    privacyPolicyRepository?: typeof privacyPolicyRepository;
    consentRecorder?: typeof consentRecorder;
  }
}

export = LoginPolicyGateService;
