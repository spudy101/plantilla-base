import BaseRepository from '../../../../shared/repositories/base.repository';
import ReadRepository from '../../../../shared/repositories/read.repository';
import type { WhereClause } from '../../../../shared/repositories/query';
import modelsModule from '../../../../shared/models';
const { NotificationCategory } = modelsModule;
import type defineNotificationCategory from '../models/notification-category.model';

class NotificationCategoryRepository extends BaseRepository<defineNotificationCategory.Instance> {
  constructor() {
    super(NotificationCategory);
  }

  findByCode(code: string) {
    return this.findOne({ code });
  }

  /**
   * Categorías activas ordenadas para pintar la pantalla de preferencias del usuario.
   */
  findAllActive() {
    return this.findAll(
      { is_active: true },
      {
        order: [
          ['sort_order', 'ASC'],
          ['name', 'ASC']
        ]
      }
    );
  }

  /**
   * Listado paginado para el admin (incluye el layout de email vía DTO).
   */
  override findAllPaginated(
    filters: ReadRepository.Filters = {},
    paginationParams: ReadRepository.PaginationParams = {},
    searchTerm: string | null = null
  ) {
    const criteria: WhereClause = {};
    if (filters.isActive !== undefined) {
      criteria.is_active = filters.isActive;
    }
    if (filters.isCritical !== undefined) {
      criteria.is_critical = filters.isCritical;
    }

    return super.findAllPaginated({}, paginationParams, searchTerm, {
      _extraFilters: criteria,
      _searchFields: ['name', 'code', 'description']
    });
  }

  codeExists(code: string) {
    return this.exists({ code });
  }
}

export default new NotificationCategoryRepository();
