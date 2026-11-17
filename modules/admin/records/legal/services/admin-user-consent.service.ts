import loggerUtilModule from '../../../../../shared/utils/logger.util';
const { logAudit } = loggerUtilModule;
import PaginationHelper from '../../../../../shared/utils/pagination.util';
import componentsCatalogDtoModule from '../../../../../shared/dtos/kyc/components-catalog.dto';
const { MetadataDTO } = componentsCatalogDtoModule;
import AppError from '../../../../../shared/utils/app-error.util';
import userConsentRepository from '../../../../schemas/records/legal/repositories/user-consent.repository';
import adminUserConsentDtoModule from '../dtos/admin-user-consent.dto';
const { UserConsentAuditItemDTO } = adminUserConsentDtoModule;

class AdminUserConsentService {
  userConsentRepository: typeof userConsentRepository;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new AdminUserConsentService({ userConsentRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps: AdminUserConsentService.Deps = {}) {
    this.userConsentRepository = deps.userConsentRepository ?? userConsentRepository;
  }

  async list(query: Record<string, unknown>, adminUserId: string) {
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

  async getHistoryByUser(userId: string, query: Record<string, unknown>, adminUserId: string) {
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

function _buildFilters(query: Record<string, unknown>) {
  const filters: { userId?: string; consentTypeCode?: string; isCurrent?: boolean; dateFrom?: Date; dateTo?: Date } = {};
  const userId = PaginationHelper.stringParam(query, 'userId');
  const consentTypeCode = PaginationHelper.stringParam(query, 'consentTypeCode');
  const dateFrom = PaginationHelper.stringParam(query, 'dateFrom');
  const dateTo = PaginationHelper.stringParam(query, 'dateTo');
  if (userId) {
    filters.userId = userId;
  }
  if (consentTypeCode) {
    filters.consentTypeCode = consentTypeCode;
  }
  if (query.isCurrent !== undefined) {
    filters.isCurrent = query.isCurrent === 'true';
  }
  if (dateFrom) {
    filters.dateFrom = new Date(dateFrom);
  }
  if (dateTo) {
    filters.dateTo = new Date(dateTo);
  }
  return filters;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace AdminUserConsentService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    userConsentRepository?: typeof userConsentRepository;
  }
}

export default Object.assign(new AdminUserConsentService(), { AdminUserConsentService });
