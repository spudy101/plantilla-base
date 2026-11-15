const { logAudit } = require('../../../../../shared/utils/logger.util');
const PaginationHelper = require('../../../../../shared/utils/pagination.util');
const { MetadataDTO } = require('../../../../../shared/dtos/kyc/components-catalog.dto');
const AppError = require('../../../../../shared/utils/app-error.util');
const userConsentRepository = require('../../../../schemas/records/legal/repositories/user-consent.repository');
const { UserConsentAuditItemDTO } = require('../dtos/admin-user-consent.dto');

class AdminUserConsentService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new AdminUserConsentService({ userConsentRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.userConsentRepository = deps.userConsentRepository ?? userConsentRepository;
  }

  async list(query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const filters = _buildFilters(query);

    const { rows, count } = await this.userConsentRepository.findAllPaginatedForAdmin(filters, {
      limit: paginationParams.limit,
      offset: paginationParams.offset
    });

    logAudit(
      'CONSENT_LIST_VIEWED',
      adminUserId,
      { totalItems: count, filters: Object.keys(filters) },
      { entityType: 'UserConsent', entityTable: 'user_consents' }
    );

    return {
      data: rows.map(r => UserConsentAuditItemDTO(r)),
      metadata: MetadataDTO.build({
        totalItems: count,
        page: paginationParams.page,
        limit: paginationParams.limit,
        sortBy: paginationParams.sortBy,
        order: paginationParams.order,
        filters: Object.keys(filters).length > 0 ? filters : undefined
      })
    };
  }

  async getHistoryByUser(userId, query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);

    const { rows, count } = await this.userConsentRepository.findHistoryByUser(userId, {
      limit: paginationParams.limit,
      offset: paginationParams.offset
    });

    if (count === 0) {
      throw AppError.notFound('No se encontraron consentimientos para este usuario');
    }

    logAudit(
      'CONSENT_HISTORY_VIEWED',
      adminUserId,
      { targetUserId: userId },
      { entityId: userId, entityType: 'UserConsent', entityTable: 'user_consents' }
    );

    return {
      data: rows.map(r => UserConsentAuditItemDTO(r)),
      metadata: MetadataDTO.build({
        totalItems: count,
        page: paginationParams.page,
        limit: paginationParams.limit,
        sortBy: paginationParams.sortBy,
        order: paginationParams.order
      })
    };
  }
}

function _buildFilters(query) {
  const filters = {};
  if (query.userId) {
    filters.userId = query.userId;
  }
  if (query.consentTypeCode) {
    filters.consentTypeCode = query.consentTypeCode;
  }
  if (query.isCurrent !== undefined) {
    filters.isCurrent = query.isCurrent === 'true';
  }
  if (query.dateFrom) {
    filters.dateFrom = new Date(query.dateFrom);
  }
  if (query.dateTo) {
    filters.dateTo = new Date(query.dateTo);
  }
  return filters;
}

module.exports = new AdminUserConsentService();
module.exports.AdminUserConsentService = AdminUserConsentService;
