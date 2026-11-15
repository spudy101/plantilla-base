const AppError = require('../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../shared/utils/logger.util');
const unitOfWork = require('../../../../../shared/database/unit-of-work');
const consentTypeRepository = require('../../../../schemas/records/legal/repositories/consent-type.repository');
const userConsentRepository = require('../../../../schemas/records/legal/repositories/user-consent.repository');
const { MyConsentCatalogDTO, ConsentGrantedDTO } = require('../dtos/user-consent.dto');

class UserConsentService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new UserConsentService({ unitOfWork: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.consentTypeRepository = deps.consentTypeRepository ?? consentTypeRepository;
    this.userConsentRepository = deps.userConsentRepository ?? userConsentRepository;
  }

  async getMyConsents(userId) {
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

  async grant(items, userId, auditCtx) {
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

  async revokeMarketing(userId, consentTypeId, auditCtx) {
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

module.exports = new UserConsentService();
module.exports.UserConsentService = UserConsentService;
