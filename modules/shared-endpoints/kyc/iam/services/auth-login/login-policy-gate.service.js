// modules/shared-endpoints/kyc/iam/services/auth-login/login-policy-gate.service.js
//
// Compuerta de política de privacidad en el login. La comparten el login por contraseña y el
// biométrico (antes estaba copiada en ambos). Extraído por SOLID: S.

const userRepository = require('../../../../../schemas/kyc/iam/repositories/user.repository');
const privacyPolicyRepository = require('../../../../../schemas/records/legal/repositories/privacy-policy.repository');
const consentRecorder = require('../../../../../schemas/records/legal/services/consent-recorder.service');
const { logger, logAudit } = require('../../../../../../shared/utils/logger.util');
const { INTERNAL_ROLE_NAMES } = require('../../../../../../shared/constants');
const { PolicyUpdateRequiredDTO } = require('../../dtos/auth-login.dto');

class LoginPolicyGateService {
  /**
   * @param {object} [deps] Dependencias inyectables (SOLID: D).
   */
  constructor(deps = {}) {
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
  async check(user, acceptPolicy, ip, { blockedAuditAction, source }) {
    const activePolicy = await this.privacyPolicyRepository.findActive();

    // Los usuarios internos no están sujetos a la política de privacidad de clientes.
    if (INTERNAL_ROLE_NAMES.includes(user.role?.name)) {
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
  async _accept(user, activePolicy, ip, source) {
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

module.exports = LoginPolicyGateService;
