// modules/schemas/records/legal/services/consent-recorder.service.ts
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

import type { Transaction } from 'sequelize';
import type { UserConsentRepositoryPort } from '../../../repository-ports';
import consentTypeRepository = require('../repositories/consent-type.repository');
import userConsentRepository = require('../repositories/user-consent.repository');
import privacyPolicyRepository = require('../repositories/privacy-policy.repository');
import constantsModule = require('../../../../../shared/constants');
const { CONSENT_TYPE_CODES } = constantsModule;

class ConsentRecorderService {
  consentTypeRepository: typeof consentTypeRepository;
  userConsentRepository: typeof userConsentRepository;
  privacyPolicyRepository: typeof privacyPolicyRepository;

  /**
   * @param {object} [deps]
   * @param {object} [deps.consentTypeRepository]
   * @param {object} [deps.userConsentRepository]
   * @param {object} [deps.privacyPolicyRepository]
   */
  constructor(deps: ConsentRecorderService.Deps = {}) {
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
  async grantPrivacyPolicy({
    userId,
    privacyPolicyId,
    ip,
    transaction
  }: {
    userId: string;
    /** undefined → se usa la política activa; null → sin política asociada */
    privacyPolicyId?: string | null;
    ip?: string | null;
    transaction?: Transaction;
  }) {
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
  async grantCommercialCommunications({ userId, ip, transaction }: { userId: string; ip?: string | null; transaction?: Transaction }) {
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
  _grant(data: Parameters<UserConsentRepositoryPort['grant']>[0], transaction?: Transaction) {
    if (transaction === undefined) {
      return this.userConsentRepository.grant(data);
    }
    return this.userConsentRepository.grant(data, transaction);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace ConsentRecorderService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    consentTypeRepository?: typeof consentTypeRepository;
    userConsentRepository?: typeof userConsentRepository;
    privacyPolicyRepository?: typeof privacyPolicyRepository;
  }
}

export = Object.assign(new ConsentRecorderService(), { ConsentRecorderService });
