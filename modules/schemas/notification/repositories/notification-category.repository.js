const BaseRepository = require('../../../../shared/repositories/base.repository');
const { NotificationCategory } = require('../../../../shared/models');

class NotificationCategoryRepository extends BaseRepository {
  constructor() {
    super(NotificationCategory);
  }

  findByCode(code) {
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
  findAllPaginated(filters = {}, paginationParams = {}, searchTerm = null) {
    const criteria = {};
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

  codeExists(code) {
    return this.exists({ code });
  }
}

module.exports = new NotificationCategoryRepository();
