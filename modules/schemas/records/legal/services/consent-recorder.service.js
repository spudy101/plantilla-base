// modules/schemas/records/legal/services/consent-recorder.service.js
//
// ============================================================
// CONSENT RECORDER — registro de consentimientos en user_consents (RF-ADM-04)
// ============================================================
// Antes esta lógica estaba copiada como función suelta en auth-login,
// auth-register y auth-biometric. Se centraliza aquí:
//   - SOLID: S → una sola razón de cambio para "cómo se registra un consentimiento".
//   - SOLID: D → los services de auth reciben este colaborador inyectado.
//   - DRY     → un único lugar para corregir/auditar el habeas data.
//
// Los llamadores deciden si el registro es best-effort (.catch) y qué loguear.
// ============================================================

const consentTypeRepository = require('../repositories/consent-type.repository');
const userConsentRepository = require('../repositories/user-consent.repository');
const privacyPolicyRepository = require('../repositories/privacy-policy.repository');
const { CONSENT_TYPE_CODES } = require('../../../../../shared/constants');

class ConsentRecorderService {
  /**
   * @param {object} [deps]
   * @param {object} [deps.consentTypeRepository]
   * @param {object} [deps.userConsentRepository]
   * @param {object} [deps.privacyPolicyRepository]
   */
  constructor(deps = {}) {
    this.consentTypeRepository = deps.consentTypeRepository ?? consentTypeRepository;
    this.userConsentRepository = deps.userConsentRepository ?? userConsentRepository;
    this.privacyPolicyRepository = deps.privacyPolicyRepository ?? privacyPolicyRepository;
  }

  /**
   * Registra la aceptación de la política de privacidad.
   * @param {object} params
   * @param {string} params.userId
   * @param {string|null} [params.privacyPolicyId] Si se omite (undefined), se usa la política activa.
   * @param {string|null} [params.ip]
   * @param {object} [params.transaction] Transacción opcional (Unit of Work).
   * @returns {Promise<object|null>} Registro creado, o null si el tipo de consentimiento no existe.
   */
  async grantPrivacyPolicy({ userId, privacyPolicyId, ip, transaction }) {
    const consentType = await this.consentTypeRepository.findByCode(CONSENT_TYPE_CODES.PRIVACY_POLICY);
    if (!consentType) {
      return null;
    }
    let policyId = privacyPolicyId;
    if (policyId === undefined) {
      const activePolicy = await this.privacyPolicyRepository.findActive();
      policyId = activePolicy?.privacy_policy_id || null;
    }
    return this._grant(
      { userId, consentTypeId: consentType.consent_type_id, privacyPolicyId: policyId, ip: ip || null, userAgent: null },
      transaction
    );
  }

  /**
   * Registra la aceptación de comunicaciones comerciales.
   * @param {object} params
   * @param {string} params.userId
   * @param {string|null} [params.ip]
   * @param {object} [params.transaction]
   * @returns {Promise<object|null>}
   */
  async grantCommercialCommunications({ userId, ip, transaction }) {
    const consentType = await this.consentTypeRepository.findByCode(CONSENT_TYPE_CODES.COMUNICACIONES_COMERCIALES);
    if (!consentType) {
      return null;
    }
    return this._grant(
      { userId, consentTypeId: consentType.consent_type_id, privacyPolicyId: null, ip: ip || null, userAgent: null },
      transaction
    );
  }

  /** @private — solo pasa la transacción si existe (mantiene la firma del repositorio). */
  _grant(data, transaction) {
    return transaction === undefined ? this.userConsentRepository.grant(data) : this.userConsentRepository.grant(data, transaction);
  }
}

module.exports = new ConsentRecorderService();
module.exports.ConsentRecorderService = ConsentRecorderService;
