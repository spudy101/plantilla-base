const notificationCategoryRepository = require('../../../schemas/notification/repositories/notification-category.repository');
const notificationTypeRepository = require('../../../schemas/notification/repositories/notification-type.repository');
const AppError = require('../../../../shared/utils/app-error.util');
const PaginationHelper = require('../../../../shared/utils/pagination.util');
const { logAudit } = require('../../../../shared/utils/logger.util');
const { sequelize } = require('../../../../shared/models');
const {
  NotificationCategoryAdminDTO,
  ListNotificationCategoriesResponseDTO
} = require('../dtos/admin-notification-category.dto');

const AUDIT_META = { entityType: 'NotificationCategory', entityTable: 'notification_categories' };

/** Mapea las keys camelCase del DTO a columnas snake_case (solo las presentes). */
function _toColumns(data = {}) {
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
  const columns = {};
  for (const [camel, snake] of Object.entries(MAP)) {
    if (data[camel] !== undefined) {
      columns[snake] = data[camel];
    }
  }
  return columns;
}

class NotificationCategoryService {
  async list(query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const filters = PaginationHelper.buildFilters(query, ['isActive', 'isCritical']);
    const searchTerm = query.search || null;

    const { rows, count } = await notificationCategoryRepository.findAllPaginated(filters, paginationParams, searchTerm);

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

  async getById(notificationCategoryId, adminUserId) {
    const category = await notificationCategoryRepository.findById(notificationCategoryId);
    if (!category) {
      throw AppError.notFound('Categoría de notificación no encontrada');
    }
    logAudit('NOTIFICATION_CATEGORY_VIEWED', adminUserId, { code: category.code }, {
      ...AUDIT_META,
      entityId: notificationCategoryId
    });
    return NotificationCategoryAdminDTO(category);
  }

  async create(data, adminUserId) {
    const code = data.code.trim().toUpperCase();
    if (await notificationCategoryRepository.codeExists(code)) {
      throw AppError.badRequest(`Ya existe una categoría con el código ${code}`);
    }

    const transaction = await sequelize.transaction();
    try {
      const category = await notificationCategoryRepository.create({ code, ..._toColumns(data) }, { transaction });
      await transaction.commit();

      logAudit('NOTIFICATION_CATEGORY_CREATED', adminUserId, { code }, {
        ...AUDIT_META,
        entityId: category.notification_category_id
      });

      return NotificationCategoryAdminDTO(category);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async update(notificationCategoryId, data, adminUserId) {
    const transaction = await sequelize.transaction();
    try {
      const category = await notificationCategoryRepository.findById(notificationCategoryId);
      if (!category) {
        throw AppError.notFound('Categoría de notificación no encontrada');
      }

      const columns = _toColumns(data);
      if (Object.keys(columns).length === 0) {
        await transaction.rollback();
        return NotificationCategoryAdminDTO(category);
      }

      const updated = await category.update(columns, { transaction });
      await transaction.commit();

      logAudit('NOTIFICATION_CATEGORY_UPDATED', adminUserId, { code: updated.code, updatedFields: Object.keys(columns) }, {
        ...AUDIT_META,
        entityId: notificationCategoryId
      });

      return NotificationCategoryAdminDTO(updated);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async remove(notificationCategoryId, adminUserId) {
    const category = await notificationCategoryRepository.findById(notificationCategoryId);
    if (!category) {
      throw AppError.notFound('Categoría de notificación no encontrada');
    }

    // No se borra una categoría que aún tiene tipos asignados: primero hay que reasignarlos.
    const assignedTypes = await notificationTypeRepository.count({ notification_category_id: notificationCategoryId });
    if (assignedTypes > 0) {
      throw AppError.badRequest(
        `No se puede eliminar: la categoría tiene ${assignedTypes} tipo(s) asignado(s). Reasignalos primero.`
      );
    }

    await notificationCategoryRepository.delete(notificationCategoryId);

    logAudit('NOTIFICATION_CATEGORY_DELETED', adminUserId, { code: category.code }, {
      ...AUDIT_META,
      entityId: notificationCategoryId
    });

    return { notificationCategoryId, deleted: true };
  }
}

module.exports = new NotificationCategoryService();
