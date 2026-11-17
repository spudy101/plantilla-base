import notificationTypeRepository from '../../../schemas/notification/repositories/notification-type.repository';
import notificationCategoryRepository from '../../../schemas/notification/repositories/notification-category.repository';
import userRepository from '../../../schemas/kyc/iam/repositories/user.repository';
import NotificationUtil from '../../../schemas/notification/services/notification-creation.service';
import AppError from '../../../../shared/utils/app-error.util';
import PaginationHelper from '../../../../shared/utils/pagination.util';
import loggerUtilModule from '../../../../shared/utils/logger.util';
const { logAudit } = loggerUtilModule;
import constantsModule from '../../../../shared/constants';
const { notifications } = constantsModule;
import unitOfWork from '../../../../shared/database/unit-of-work';
import adminNotificationTypeDtoModule from '../dtos/admin-notification-type.dto';
const {
  ListNotificationTypesResponseDTO,
  UpdateNotificationTypeResponseDTO,
  CreateGlobalNotificationResponseDTO,
  CreateDirectNotificationResponseDTO
} = adminNotificationTypeDtoModule;

class NotificationTypeService {
  unitOfWork: typeof unitOfWork;
  notificationTypeRepository: typeof notificationTypeRepository;
  notificationCategoryRepository: typeof notificationCategoryRepository;
  userRepository: typeof userRepository;
  NotificationUtil: typeof NotificationUtil;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new NotificationTypeService({ unitOfWork: fake })
   * @param {object} [deps]
   */
  constructor(deps: NotificationTypeService.Deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.notificationTypeRepository = deps.notificationTypeRepository ?? notificationTypeRepository;
    this.notificationCategoryRepository = deps.notificationCategoryRepository ?? notificationCategoryRepository;
    this.userRepository = deps.userRepository ?? userRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
  }

  async list(query: Record<string, unknown>, adminUserId: string) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const filters = PaginationHelper.buildFilters(query, ['isActive', 'priority', 'notificationCategoryId']);
    const searchTerm = PaginationHelper.stringParam(query, 'search');

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

  async update(notificationTypeId: string, data: Record<string, unknown>, adminUserId: string) {
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

    const updateData: Record<string, unknown> = {};
    for (const [camel, snake] of Object.entries(FIELD_MAP)) {
      if (data[camel] !== undefined) {
        updateData[snake] = data[camel];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return UpdateNotificationTypeResponseDTO(nt);
    }

    const updated = await this.unitOfWork.run(transaction => nt.update(updateData, { transaction }));

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
  }

  async createGlobalNotification(data: { titulo: string; contenido: string; asunto?: string | null }, adminUserId: string) {
    const { titulo, contenido, asunto } = data;

    const result = await this.NotificationUtil.crearNotificacion({
      tipoNotificacion: 'NOTIFICACION_GENERAL',
      userId: null,
      relatedEntity: null,
      metadata: { titulo, contenido, asunto, logoUrl: notifications.ses.logoUrl }
    });
    // userId null → la creación devuelve la notificación global
    const globalNotificationId = 'global_notification_id' in result ? result.global_notification_id : '';

    logAudit(
      'GLOBAL_NOTIFICATION_SENT',
      adminUserId,
      { titulo },
      { entityId: globalNotificationId, entityType: 'GlobalNotification', entityTable: 'global_notifications' }
    );

    return CreateGlobalNotificationResponseDTO({
      global_notification_id: globalNotificationId,
      titulo,
      contenido,
      asunto
    });
  }

  async createDirectNotification(data: { userId: string; titulo: string; contenido: string; asunto?: string | null }, adminUserId: string) {
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
    const notificationId = 'notification_id' in result ? result.notification_id : '';

    logAudit(
      'DIRECT_NOTIFICATION_SENT',
      adminUserId,
      { userId, titulo },
      { entityId: notificationId, entityType: 'Notification', entityTable: 'notifications' }
    );

    return CreateDirectNotificationResponseDTO({
      notification_id: notificationId,
      userId,
      titulo,
      contenido,
      asunto
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace NotificationTypeService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    unitOfWork?: typeof unitOfWork;
    notificationTypeRepository?: typeof notificationTypeRepository;
    notificationCategoryRepository?: typeof notificationCategoryRepository;
    userRepository?: typeof userRepository;
    NotificationUtil?: typeof NotificationUtil;
  }
}

export default Object.assign(new NotificationTypeService(), { NotificationTypeService });
