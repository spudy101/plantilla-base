import type { RequestAuditContext } from '../../../../../shared/types/audit-context';
import AppError = require('../../../../../shared/utils/app-error.util');
import loggerUtilModule = require('../../../../../shared/utils/logger.util');
const { logger, logAudit } = loggerUtilModule;
import unitOfWork = require('../../../../../shared/database/unit-of-work');
import consentTypeRepository = require('../../../../schemas/records/legal/repositories/consent-type.repository');
import userConsentRepository = require('../../../../schemas/records/legal/repositories/user-consent.repository');
import userConsentDtoModule = require('../dtos/user-consent.dto');
const { MyConsentCatalogDTO, ConsentGrantedDTO } = userConsentDtoModule;

class UserConsentService {
  unitOfWork: typeof unitOfWork;
  consentTypeRepository: typeof consentTypeRepository;
  userConsentRepository: typeof userConsentRepository;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new UserConsentService({ unitOfWork: fake })
   * @param {object} [deps]
   */
  constructor(deps: UserConsentService.Deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.consentTypeRepository = deps.consentTypeRepository ?? consentTypeRepository;
    this.userConsentRepository = deps.userConsentRepository ?? userConsentRepository;
  }

  async getMyConsents(userId: string) {
    const [consentTypes, currentConsents] = await Promise.all([
      this.consentTypeRepository.findAllActive(),
      this.userConsentRepository.findCurrentByUser(userId)
    ]);

    const grantedByTypeId = new Map(currentConsents.map(c => [c.consent_type_id, c]));
    const data = consentTypes.map(type => MyConsentCatalogDTO(type, grantedByTypeId.get(type.consent_type_id) || null));

    logAudit(
      'CONSENT_CATALOG_VIEWED',
      userId,
      { totalItems: data.length, grantedCount: currentConsents.length },
      { entityTable: 'consent_types' }
    );

    return data;
  }

  async grant(
    items: Array<{ consentTypeCode: string; privacyPolicyId?: string | null }>,
    userId: string,
    auditCtx: Pick<RequestAuditContext, 'ip' | 'userAgent'>
  ) {
    if (!items || items.length === 0) {
      throw AppError.badRequest('Debe proporcionar al menos un consentimiento a otorgar');
    }

    const transaction = await this.unitOfWork.begin();
    try {
      const granted = [];
      const auditEntries = [];

      for (const item of items) {
        const consentType = await this.consentTypeRepository.findByCode(item.consentTypeCode);
        if (!consentType) {
          throw AppError.badRequest(`Tipo de consentimiento "${item.consentTypeCode}" no encontrado o inactivo`);
        }

        const record = await this.userConsentRepository.grant(
          {
            userId,
            consentTypeId: consentType.consent_type_id,
            privacyPolicyId: item.privacyPolicyId || null,
            ip: auditCtx.ip,
            userAgent: auditCtx.userAgent
          },
          transaction
        );

        auditEntries.push({
          consentTypeCode: item.consentTypeCode,
          consentTypeId: consentType.consent_type_id,
          privacyPolicyId: item.privacyPolicyId || null,
          userConsentId: record.user_consent_id
        });

        granted.push(ConsentGrantedDTO(record));
      }

      await transaction.commit();

      for (const entry of auditEntries) {
        logAudit(
          'CONSENT_GRANTED',
          userId,
          {
            consentTypeCode: entry.consentTypeCode,
            consentTypeId: entry.consentTypeId,
            privacyPolicyId: entry.privacyPolicyId
          },
          { entityType: 'UserConsent', entityId: entry.userConsentId, entityTable: 'user_consents' }
        );
      }

      logger.info('UserConsentService.grant', { userId, count: granted.length });

      return granted;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  async revokeMarketing(
    userId: string,
    consentTypeId: string,
    auditCtx: Pick<RequestAuditContext, 'ip' | 'userAgent'> & { reason?: string | null }
  ) {
    const consentType = await this.consentTypeRepository.findById(consentTypeId);
    if (!consentType) {
      throw AppError.notFound('Tipo de consentimiento no encontrado');
    }
    if (!consentType.is_revocable) {
      throw AppError.badRequest('Este consentimiento no puede ser revocado');
    }

    const transaction = await this.unitOfWork.begin();
    try {
      const revoked = await this.userConsentRepository.revoke(
        {
          userId,
          consentTypeId,
          ip: auditCtx.ip,
          reason: auditCtx.reason || null
        },
        transaction
      );

      if (!revoked) {
        throw AppError.notFound('No se encontró un consentimiento activo para revocar');
      }

      await transaction.commit();

      logAudit(
        'CONSENT_REVOKED',
        userId,
        { consentTypeId, reason: auditCtx.reason || null },
        { entityType: 'UserConsent', entityId: revoked.user_consent_id, entityTable: 'user_consents' }
      );

      logger.info('UserConsentService.revokeMarketing', { userId, consentTypeId });
      return { message: 'Consentimiento revocado exitosamente' };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace UserConsentService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    unitOfWork?: typeof unitOfWork;
    consentTypeRepository?: typeof consentTypeRepository;
    userConsentRepository?: typeof userConsentRepository;
  }
}

export = Object.assign(new UserConsentService(), { UserConsentService });
