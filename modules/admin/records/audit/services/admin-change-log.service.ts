import userChangeLogRepository from '../../../../schemas/records/audit/repositories/user-change-log.repository';
import PaginationHelper from '../../../../../shared/utils/pagination.util';
import loggerUtilModule from '../../../../../shared/utils/logger.util';
const { logAudit } = loggerUtilModule;
import adminChangeLogDtoModule from '../dtos/admin-change-log.dto';
const { ListUserChangeLogsResponseDTO } = adminChangeLogDtoModule;

class ChangeLogService {
  userChangeLogRepository: typeof userChangeLogRepository;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new ChangeLogService({ userChangeLogRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps: ChangeLogService.Deps = {}) {
    this.userChangeLogRepository = deps.userChangeLogRepository ?? userChangeLogRepository;
  }

  async listUserChangeLogs(query: Record<string, unknown>, adminUserId: string) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const filters = PaginationHelper.buildFilters(query, ['changeType', 'changedByRole']);
    const searchTerm = PaginationHelper.stringParam(query, 'search');

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
        ...(PaginationHelper.stringParam(query, 'userId') ? { targetUserId: PaginationHelper.stringParam(query, 'userId') } : {})
      },
      { entityId: PaginationHelper.stringParam(query, 'userId'), entityType: 'AuditRecord' }
    );

    return ListUserChangeLogsResponseDTO(rows, metadata);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace ChangeLogService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    userChangeLogRepository?: typeof userChangeLogRepository;
  }
}

export default Object.assign(new ChangeLogService(), { ChangeLogService });
