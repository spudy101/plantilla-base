import BaseRepository from '../../../../shared/repositories/base.repository';
import ReadRepository from '../../../../shared/repositories/read.repository';
import type { WhereClause } from '../../../../shared/repositories/query';
import modelsModule from '../../../../shared/models';
const { NotificationType } = modelsModule;
import type defineNotificationType from '../models/notification-type.model';

class NotificationTypeRepository extends BaseRepository<defineNotificationType.Instance> {
  constructor() {
    super(NotificationType);
  }

  /**
   * Busca un tipo de notificación por su código, con su categoría incluida.
   * La categoría es la fuente de verdad de canales (email/sms/push), DND y layout de email.
   */
  findByCode(code: string) {
    return this.findOne({ code, is_active: true }, { include: [{ association: 'category' }] });
  }

  /**
   * Obtiene todos los tipos activos
   */
  findAllActive() {
    return this.findAll({ is_active: true }, { order: [['name', 'ASC']] });
  }

  /**
   * Obtiene tipos por prioridad
   */
  findByPriority(priority: defineNotificationType.Attributes['priority']) {
    return this.findAll({ is_active: true, priority }, { order: [['name', 'ASC']] });
  }

  /**
   * Verifica si un código existe
   */
  codeExists(code: string) {
    return this.exists({ code });
  }

  /**
   * Busca tipos de notificación con paginación y búsqueda
   * @param {Object} filters - { isActive, priority, notificationCategoryId }
   * @param {Object} paginationParams - { page, limit, offset, sortBy, order }
   * @param {string} searchTerm - Término de búsqueda (opcional)
   * @returns {Promise<{ rows: Array, count: number }>}
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

    if (filters.priority) {
      criteria.priority = filters.priority;
    }

    if (filters.notificationCategoryId) {
      criteria.notification_category_id = filters.notificationCategoryId;
    }

    // El base findAllPaginated solo inyecta al WHERE las keys conocidas (isActive / filterId)
    // o lo que llegue en _extraFilters. Por eso los filtros van por _extraFilters, y los campos
    // de búsqueda por _searchFields. La categoría (canales/DND/layout) se incluye asociada.
    return super.findAllPaginated({}, paginationParams, searchTerm, {
      _extraFilters: criteria,
      _searchFields: ['name', 'code', 'description'],
      include: [{ association: 'category' }],
      attributes: [
        'notification_type_id',
        'code',
        'name',
        'description',
        'notification_category_id',
        'priority',
        // Templates: el admin los ve completos (DTO NotificationTypeAdminDTO los expone).
        // El email_body_template es el fragmento que se inyecta en el layout de la categoría.
        'title_template',
        'body_template',
        'email_subject_template',
        'email_body_template',
        'is_active',
        'createdAt',
        'updatedAt'
      ]
    });
  }
}

export default new NotificationTypeRepository();
