import BaseRepository = require('../../../../../shared/repositories/base.repository');
import modelsModule = require('../../../../../shared/models');
const { UserConsent, ConsentType, PrivacyPolicy, User, Person } = modelsModule;
import requestContext = require('../../../../../shared/utils/request-context.util');
import type { IncludeOptions, Transaction } from 'sequelize';
import type defineUserConsent = require('../models/user-consent.model');
import queryModule = require('../../../../../shared/repositories/query');
const { range, toWhere } = queryModule;
import type { WhereClause } from '../../../../../shared/repositories/query';

const CONSENT_TYPE_INCLUDE: IncludeOptions = {
  model: ConsentType,
  as: 'consentType',
  attributes: ['consent_type_id', 'code', 'name', 'is_mandatory', 'is_revocable']
};

const PRIVACY_POLICY_INCLUDE: IncludeOptions = {
  model: PrivacyPolicy,
  as: 'privacyPolicy',
  attributes: ['privacy_policy_id', 'version', 'document_url', 'effective_date']
};

const USER_INCLUDE: IncludeOptions = {
  model: User,
  as: 'user',
  attributes: ['user_id', 'username'],
  include: [{ model: Person, as: 'person', attributes: ['first_name', 'last_name'] }]
};

class UserConsentRepository extends BaseRepository<defineUserConsent.Instance> {
  constructor() {
    super(UserConsent);
  }

  findCurrentByUser(userId: string) {
    return this.model.findAll({
      where: { user_id: userId, is_current: true },
      include: [CONSENT_TYPE_INCLUDE, PRIVACY_POLICY_INCLUDE],
      order: [['granted_at', 'DESC']]
    });
  }

  findCurrentByUserAndType(userId: string, consentTypeId: string) {
    return this.model.findOne({
      where: { user_id: userId, consent_type_id: consentTypeId, is_current: true }
    });
  }

  findHistoryByUser(userId: string, { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}) {
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
  async grant(
    {
      userId,
      consentTypeId,
      privacyPolicyId,
      ip,
      userAgent
    }: { userId: string; consentTypeId: string; privacyPolicyId?: string | null; ip?: string | null; userAgent?: string | null },
    transaction?: Transaction
  ) {
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
  async revoke(
    { userId, consentTypeId, ip, reason }: { userId: string; consentTypeId: string; ip?: string | null; reason?: string | null },
    transaction?: Transaction
  ) {
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
  revokeAll(userId: string, transaction?: Transaction) {
    return this.model.update(
      { revoked_at: new Date(), is_current: false, revocation_reason: 'right_to_erasure' },
      { where: { user_id: userId, is_current: true }, transaction }
    );
  }

  // Trae todos los consentimientos vigentes de scope ONBOARDING para el expediente de vinculación.
  findOnboardingConsentsForDossier(userId: string) {
    return this.model.findAll({
      where: { user_id: userId, is_current: true },
      include: [{ ...CONSENT_TYPE_INCLUDE, where: { scope: 'ONBOARDING' } }, PRIVACY_POLICY_INCLUDE],
      order: [['granted_at', 'ASC']]
    });
  }

  findAllPaginatedForAdmin(
    filters: UserConsentRepository.AdminFilters = {},
    { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {}
  ) {
    const where: WhereClause = {};
    if (filters.userId) {
      where.user_id = filters.userId;
    }
    if (filters.isCurrent !== undefined) {
      where.is_current = filters.isCurrent;
    }
    const grantedAtRange = range(filters.dateFrom, filters.dateTo);
    if (grantedAtRange) {
      where.granted_at = grantedAtRange;
    }

    const include: IncludeOptions[] = [CONSENT_TYPE_INCLUDE, PRIVACY_POLICY_INCLUDE, USER_INCLUDE];
    if (filters.consentTypeCode) {
      include[0] = { ...CONSENT_TYPE_INCLUDE, where: { code: filters.consentTypeCode } };
    }

    return this.model.findAndCountAll({
      where: toWhere(where),
      include,
      order: [['granted_at', 'DESC']],
      limit,
      offset,
      distinct: true
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace UserConsentRepository {
  export interface AdminFilters {
    userId?: string;
    isCurrent?: boolean;
    dateFrom?: string | Date;
    dateTo?: string | Date;
    consentTypeCode?: string;
  }
}

export = new UserConsentRepository();
