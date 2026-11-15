const userChangeLogRepository = require('../../../../schemas/records/audit/repositories/user-change-log.repository');
const PaginationHelper = require('../../../../../shared/utils/pagination.util');
const { logAudit } = require('../../../../../shared/utils/logger.util');
const { ListUserChangeLogsResponseDTO } = require('../dtos/admin-change-log.dto');

class ChangeLogService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new ChangeLogService({ userChangeLogRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.userChangeLogRepository = deps.userChangeLogRepository ?? userChangeLogRepository;
  }

  async listUserChangeLogs(query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const filters = PaginationHelper.buildFilters(query, ['changeType', 'changedByRole']);
    const searchTerm = query.search || null;

    if (query.userId) {
      filters.user_id = query.userId;
    }

    if (query.dateFrom) {
      filters.dateFrom = query.dateFrom;
    }

    if (query.dateTo) {
      filters.dateTo = query.dateTo;
    }

    const { rows, count } = await this.userChangeLogRepository.findAllPaginated(filters, paginationParams, searchTerm);

    const metadata = {
      totalItems: count,
      page: paginationParams.page,
      limit: paginationParams.limit,
      sortBy: paginationParams.sortBy,
      order: paginationParams.order,
      filters: searchTerm ? { search: searchTerm, ...filters } : filters
    };

    logAudit(
      'CHANGE_LOG_VIEWED',
      adminUserId,
      {
        totalItems: count,
        page: paginationParams.page,
        ...(query.userId && { targetUserId: query.userId })
      },
      { entityId: query.userId ?? null, entityType: 'AuditRecord' }
    );

    return ListUserChangeLogsResponseDTO(rows, metadata);
  }
}

module.exports = new ChangeLogService();
module.exports.ChangeLogService = ChangeLogService;
