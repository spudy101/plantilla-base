import type defineNotificationCategory from '../../../schemas/notification/models/notification-category.model';
import notificationCategoryRepository from '../../../schemas/notification/repositories/notification-category.repository';
import notificationTypeRepository from '../../../schemas/notification/repositories/notification-type.repository';
import AppError from '../../../../shared/utils/app-error.util';
import PaginationHelper from '../../../../shared/utils/pagination.util';
import loggerUtilModule from '../../../../shared/utils/logger.util';
const { logAudit } = loggerUtilModule;
import unitOfWork from '../../../../shared/database/unit-of-work';
import adminNotificationCategoryDtoModule from '../dtos/admin-notification-category.dto';
const {
  NotificationCategoryAdminDTO,
  ListNotificationCategoriesResponseDTO
} = adminNotificationCategoryDtoModule;

const AUDIT_META = { entityType: 'NotificationCategory', entityTable: 'notification_categories' };

/** Mapea las keys camelCase del DTO a columnas snake_case (solo las presentes). */
// Entrada del panel (camelCase) → columnas (snake_case); el validator ya filtró las claves
function _toColumns(data: Record<string, unknown> = {}): Partial<defineNotificationCategory.Attributes> {
  const MAP = {
    name: 'name',
    description: 'description',
    supportsPush: 'supports_push',
    supportsEmail: 'supports_email',
    supportsSms: 'supports_sms',
    allowDnd: 'allow_dnd',
    isCritical: 'is_critical',
    defaultQuietHoursStart: 'default_quiet_hours_start',
    defaultQuietHoursEnd: 'default_quiet_hours_end',
    priority: 'priority',
    emailLayoutTemplate: 'email_layout_template',
    sortOrder: 'sort_order',
    isActive: 'is_active'
  };
  const columns: Record<string, unknown> = {};
  for (const [camel, snake] of Object.entries(MAP)) {
    if (data[camel] !== undefined) {
      columns[snake] = data[camel];
    }
  }
  return columns as Partial<defineNotificationCategory.Attributes>;
}

class NotificationCategoryService {
  unitOfWork: typeof unitOfWork;
  notificationCategoryRepository: typeof notificationCategoryRepository;
  notificationTypeRepository: typeof notificationTypeRepository;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new NotificationCategoryService({ unitOfWork: fake })
   * @param {object} [deps]
   */
  constructor(deps: NotificationCategoryService.Deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.notificationCategoryRepository = deps.notificationCategoryRepository ?? notificationCategoryRepository;
    this.notificationTypeRepository = deps.notificationTypeRepository ?? notificationTypeRepository;
  }

  async list(query: Record<string, unknown>, adminUserId: string) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const filters = PaginationHelper.buildFilters(query, ['isActive', 'isCritical']);
    const searchTerm = PaginationHelper.stringParam(query, 'search');

    const { rows, count } = await this.notificationCategoryRepository.findAllPaginated(filters, paginationParams, searchTerm);

    const metadata = {
      totalItems: count,
      page: paginationParams.page,
      limit: paginationParams.limit,
      sortBy: paginationParams.sortBy,
      order: paginationParams.order,
      filters: searchTerm ? { search: searchTerm, ...filters } : filters
    };

    logAudit('NOTIFICATION_CATEGORY_LIST_VIEWED', adminUserId, { totalItems: count }, AUDIT_META);

    return ListNotificationCategoriesResponseDTO(rows, metadata);
  }

  async getById(notificationCategoryId: string, adminUserId: string) {
    const category = await this.notificationCategoryRepository.findById(notificationCategoryId);
    if (!category) {
      throw AppError.notFound('Categoría de notificación no encontrada');
    }
    logAudit('NOTIFICATION_CATEGORY_VIEWED', adminUserId, { code: category.code }, {
      ...AUDIT_META,
      entityId: notificationCategoryId
    });
    return NotificationCategoryAdminDTO(category);
  }

  async create(data: { code: string } & Record<string, unknown>, adminUserId: string) {
    const code = data.code.trim().toUpperCase();
    if (await this.notificationCategoryRepository.codeExists(code)) {
      throw AppError.badRequest(`Ya existe una categoría con el código ${code}`);
    }

    const category = await this.unitOfWork.run(async transaction => {
      const category = await this.notificationCategoryRepository.create(
        { code, ..._toColumns(data) } as defineNotificationCategory.CreationAttributes,
        { transaction }
      );
      return category;
    });

    logAudit('NOTIFICATION_CATEGORY_CREATED', adminUserId, { code }, {
      ...AUDIT_META,
      entityId: category.notification_category_id
    });

    return NotificationCategoryAdminDTO(category);
  }

  async update(notificationCategoryId: string, data: Record<string, unknown>, adminUserId: string) {
    const category = await this.notificationCategoryRepository.findById(notificationCategoryId);
    if (!category) {
      throw AppError.notFound('Categoría de notificación no encontrada');
    }

    const columns = _toColumns(data);
    if (Object.keys(columns).length === 0) {
      return NotificationCategoryAdminDTO(category);
    }

    const updated = await this.unitOfWork.run(transaction =>
      this.notificationCategoryRepository.update(notificationCategoryId, columns, { transaction })
    );
    if (!updated) {
      throw AppError.notFound('Categoría de notificación no encontrada');
    }

    logAudit('NOTIFICATION_CATEGORY_UPDATED', adminUserId, { code: updated.code, updatedFields: Object.keys(columns) }, {
      ...AUDIT_META,
      entityId: notificationCategoryId
    });

    return NotificationCategoryAdminDTO(updated);
  }

  async remove(notificationCategoryId: string, adminUserId: string) {
    const category = await this.notificationCategoryRepository.findById(notificationCategoryId);
    if (!category) {
      throw AppError.notFound('Categoría de notificación no encontrada');
    }

    // No se borra una categoría que aún tiene tipos asignados: primero hay que reasignarlos.
    const assignedTypes = await this.notificationTypeRepository.count({ notification_category_id: notificationCategoryId });
    if (assignedTypes > 0) {
      throw AppError.badRequest(
        `No se puede eliminar: la categoría tiene ${assignedTypes} tipo(s) asignado(s). Reasignalos primero.`
      );
    }

    await this.notificationCategoryRepository.delete(notificationCategoryId);

    logAudit('NOTIFICATION_CATEGORY_DELETED', adminUserId, { code: category.code }, {
      ...AUDIT_META,
      entityId: notificationCategoryId
    });

    return { notificationCategoryId, deleted: true };
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace NotificationCategoryService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    unitOfWork?: typeof unitOfWork;
    notificationCategoryRepository?: typeof notificationCategoryRepository;
    notificationTypeRepository?: typeof notificationTypeRepository;
  }
}

export default Object.assign(new NotificationCategoryService(), { NotificationCategoryService });
