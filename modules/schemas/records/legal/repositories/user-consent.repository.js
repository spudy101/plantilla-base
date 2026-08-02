const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { UserConsent, ConsentType, PrivacyPolicy, User, Person } = require('../../../../../shared/models');
const requestContext = require('../../../../../shared/utils/request-context.util');
const { Op } = require('sequelize');

const CONSENT_TYPE_INCLUDE = {
  model: ConsentType,
  as: 'consentType',
  attributes: ['consent_type_id', 'code', 'name', 'is_mandatory', 'is_revocable']
};

const PRIVACY_POLICY_INCLUDE = {
  model: PrivacyPolicy,
  as: 'privacyPolicy',
  attributes: ['privacy_policy_id', 'version', 'document_url', 'effective_date']
};

const USER_INCLUDE = {
  model: User,
  as: 'user',
  attributes: ['user_id', 'username'],
  include: [{ model: Person, as: 'person', attributes: ['first_name', 'last_name'] }]
};

class UserConsentRepository extends BaseRepository {
  constructor() {
    super(UserConsent);
  }

  findCurrentByUser(userId) {
    return this.model.findAll({
      where: { user_id: userId, is_current: true },
      include: [CONSENT_TYPE_INCLUDE, PRIVACY_POLICY_INCLUDE],
      order: [['granted_at', 'DESC']]
    });
  }

  findCurrentByUserAndType(userId, consentTypeId) {
    return this.model.findOne({
      where: { user_id: userId, consent_type_id: consentTypeId, is_current: true }
    });
  }

  findHistoryByUser(userId, { limit = 50, offset = 0 } = {}) {
    return this.model.findAndCountAll({
      where: { user_id: userId },
      include: [CONSENT_TYPE_INCLUDE, PRIVACY_POLICY_INCLUDE, USER_INCLUDE],
      order: [['granted_at', 'DESC']],
      limit,
      offset,
      distinct: true
    });
  }

  /**
   * Otorga un consentimiento. Si ya existe uno activo para user+type, lo marca como no vigente
   * antes de crear el nuevo. Se ejecuta en una transacción.
   */
  async grant({ userId, consentTypeId, privacyPolicyId, ip, userAgent }, transaction) {
    await this.model.update(
      { is_current: false },
      { where: { user_id: userId, consent_type_id: consentTypeId, is_current: true }, transaction }
    );

    return this.model.create(
      {
        user_id: userId,
        consent_type_id: consentTypeId,
        privacy_policy_id: privacyPolicyId || null,
        granted_at: new Date(),
        granted_ip: ip || null,
        granted_user_agent: userAgent || null,
        is_current: true,
        // La sesión se fotografía acá y no en cada llamador: grant() tiene 5 call sites en 5
        // services distintos y un olvido dejaría el consentimiento sin trazabilidad de sesión.
        ...requestContext.originFromContext()
      },
      { transaction }
    );
  }

  /**
   * Revoca el consentimiento activo de un usuario para un tipo específico.
   */
  async revoke({ userId, consentTypeId, ip, reason }, transaction) {
    const current = await this.findCurrentByUserAndType(userId, consentTypeId);
    if (!current) {
      return null;
    }
    return current.update(
      {
        revoked_at: new Date(),
        revoked_ip: ip || null,
        revocation_reason: reason || null,
        is_current: false
      },
      { transaction }
    );
  }

  /**
   * Revoca todos los consentimientos activos de un usuario (derecho de supresión).
   */
  revokeAll(userId, transaction) {
    return this.model.update(
      { revoked_at: new Date(), is_current: false, revocation_reason: 'right_to_erasure' },
      { where: { user_id: userId, is_current: true }, transaction }
    );
  }

  // Trae todos los consentimientos vigentes de scope ONBOARDING para el expediente de vinculación.
  findOnboardingConsentsForDossier(userId) {
    return this.model.findAll({
      where: { user_id: userId, is_current: true },
      include: [{ ...CONSENT_TYPE_INCLUDE, where: { scope: 'ONBOARDING' } }, PRIVACY_POLICY_INCLUDE],
      order: [['granted_at', 'ASC']]
    });
  }

  findAllPaginatedForAdmin(filters = {}, { limit = 20, offset = 0 } = {}) {
    const where = {};
    if (filters.userId) {
      where.user_id = filters.userId;
    }
    if (filters.isCurrent !== undefined) {
      where.is_current = filters.isCurrent;
    }
    if (filters.dateFrom || filters.dateTo) {
      where.granted_at = {};
      if (filters.dateFrom) {
        where.granted_at[Op.gte] = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.granted_at[Op.lte] = filters.dateTo;
      }
    }

    const include = [CONSENT_TYPE_INCLUDE, PRIVACY_POLICY_INCLUDE, USER_INCLUDE];
    if (filters.consentTypeCode) {
      include[0] = { ...CONSENT_TYPE_INCLUDE, where: { code: filters.consentTypeCode } };
    }

    return this.model.findAndCountAll({
      where,
      include,
      order: [['granted_at', 'DESC']],
      limit,
      offset,
      distinct: true
    });
  }
}

module.exports = new UserConsentRepository();
