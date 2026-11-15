const notificationTypeRepository = require('../../../schemas/notification/repositories/notification-type.repository');
const notificationCategoryRepository = require('../../../schemas/notification/repositories/notification-category.repository');
const userRepository = require('../../../schemas/kyc/iam/repositories/user.repository');
const NotificationUtil = require('../../../schemas/notification/services/notification-creation.service');
const AppError = require('../../../../shared/utils/app-error.util');
const PaginationHelper = require('../../../../shared/utils/pagination.util');
const { logAudit } = require('../../../../shared/utils/logger.util');
const { notifications } = require('../../../../shared/constants');
const unitOfWork = require('../../../../shared/database/unit-of-work');
const {
  ListNotificationTypesResponseDTO,
  UpdateNotificationTypeResponseDTO,
  CreateGlobalNotificationResponseDTO,
  CreateDirectNotificationResponseDTO
} = require('../dtos/admin-notification-type.dto');

class NotificationTypeService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new NotificationTypeService({ unitOfWork: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.notificationTypeRepository = deps.notificationTypeRepository ?? notificationTypeRepository;
    this.notificationCategoryRepository = deps.notificationCategoryRepository ?? notificationCategoryRepository;
    this.userRepository = deps.userRepository ?? userRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
  }

  async list(query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const filters = PaginationHelper.buildFilters(query, ['isActive', 'priority', 'notificationCategoryId']);
    const searchTerm = query.search || null;

    const { rows, count } = await this.notificationTypeRepository.findAllPaginated(filters, paginationParams, searchTerm);

    const metadata = {
      totalItems: count,
      page: paginationParams.page,
      limit: paginationParams.limit,
      sortBy: paginationParams.sortBy,
      order: paginationParams.order,
      filters: searchTerm ? { search: searchTerm, ...filters } : filters
    };

    // ✅ .description extrae el string del objeto AUDIT_ACTIONS
    logAudit(
      'NOTIFICATION_TYPE_LIST_VIEWED',
      adminUserId,
      {
        totalItems: count,
        page: paginationParams.page
      },
      { entityType: 'NotificationType', entityTable: 'notification_types' }
    );

    return ListNotificationTypesResponseDTO(rows, metadata);
  }

  async update(notificationTypeId, data, adminUserId) {
    const transaction = await this.unitOfWork.begin();

    try {
      const nt = await this.notificationTypeRepository.findById(notificationTypeId);
      if (!nt) {
        throw AppError.notFound('Tipo de notificación no encontrado');
      }

      // Si se reasigna la categoría, validar que exista (además del FK) para dar un error claro.
      if (data.notificationCategoryId) {
        const category = await this.notificationCategoryRepository.findById(data.notificationCategoryId);
        if (!category) {
          throw AppError.badRequest('La categoría indicada no existe');
        }
      }

      // Los templates no se incluyen: son read-only vía API. Los canales/DND viven en la categoría.
      const FIELD_MAP = {
        name: 'name',
        description: 'description',
        priority: 'priority',
        notificationCategoryId: 'notification_category_id'
      };

      const updateData = {};
      for (const [camel, snake] of Object.entries(FIELD_MAP)) {
        if (data[camel] !== undefined) {
          updateData[snake] = data[camel];
        }
      }

      if (Object.keys(updateData).length === 0) {
        await transaction.rollback();
        return UpdateNotificationTypeResponseDTO(nt);
      }

      const updated = await nt.update(updateData, { transaction });
      await transaction.commit();

      logAudit(
        'NOTIFICATION_TYPE_UPDATED',
        adminUserId,
        {
          code: updated.code,
          updatedFields: Object.keys(updateData)
        },
        { entityId: notificationTypeId, entityType: 'NotificationType', entityTable: 'notification_types' }
      );

      return UpdateNotificationTypeResponseDTO(updated);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async createGlobalNotification(data, adminUserId) {
    const { titulo, contenido, asunto } = data;

    const result = await this.NotificationUtil.crearNotificacion({
      tipoNotificacion: 'NOTIFICACION_GENERAL',
      userId: null,
      relatedEntity: null,
      metadata: { titulo, contenido, asunto, logoUrl: notifications.ses.logoUrl }
    });

    logAudit(
      'GLOBAL_NOTIFICATION_SENT',
      adminUserId,
      { titulo },
      { entityId: result.global_notification_id, entityType: 'GlobalNotification', entityTable: 'global_notifications' }
    );

    return CreateGlobalNotificationResponseDTO({
      global_notification_id: result.global_notification_id,
      titulo,
      contenido,
      asunto
    });
  }

  async createDirectNotification(data, adminUserId) {
    const { userId, titulo, contenido, asunto } = data;

    const user = await this.userRepository.findByUserId(userId, 'minimal');
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }
    if (!user.is_active) {
      throw AppError.badRequest('No se puede notificar a un usuario inactivo');
    }

    const result = await this.NotificationUtil.crearNotificacion({
      tipoNotificacion: 'NOTIFICACION_GENERAL',
      userId,
      relatedEntity: null,
      metadata: { titulo, contenido, asunto, logoUrl: notifications.ses.logoUrl }
    });

    logAudit(
      'DIRECT_NOTIFICATION_SENT',
      adminUserId,
      { userId, titulo },
      { entityId: result.notification_id, entityType: 'Notification', entityTable: 'notifications' }
    );

    return CreateDirectNotificationResponseDTO({
      notification_id: result.notification_id,
      userId,
      titulo,
      contenido,
      asunto
    });
  }
}

module.exports = new NotificationTypeService();
module.exports.NotificationTypeService = NotificationTypeService;
