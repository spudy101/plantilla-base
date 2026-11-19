// Consulta admin de las entregas de notificaciones (soporte: "¿le llegó el correo a este usuario?").
// Solo lectura: los reintentos son automáticos (notification-delivery.service).
import type { NotificationChannel, NotificationDeliveryStatus } from '../../../shared/database/generated/prisma/client';
import deliveryRepo from '../repositories/notification-delivery.repository';
import PaginationHelper from '../../../shared/http/pagination.util';
import catalogsModule from '../../catalogs';
const { catalogComponentsDto: componentsCatalogDtoModule } = catalogsModule;
const { MetadataDTO } = componentsCatalogDtoModule;
import AppError from '../../../shared/http/app-error.util';
import adminNotificationDeliveryDtoModule from '../responses/admin-notification-delivery.response';
const { NotificationDeliveryListDTO, NotificationDeliveryDetailDTO } = adminNotificationDeliveryDtoModule;
import auditModule from '../../audit';
const { audit } = auditModule;

class AdminNotificationDeliveryService {
  deliveryRepo: typeof deliveryRepo;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones reales:
   *   new AdminNotificationDeliveryService({ deliveryRepo: fake })
   */
  constructor(deps: AdminNotificationDeliveryService.Deps = {}) {
    this.deliveryRepo = deps.deliveryRepo ?? deliveryRepo;
  }

  async list(query: Record<string, unknown>, adminUserId: string) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    // status y channel ya vienen validados contra sus valores (DeliveryListQuery)
    const filters = {
      status: PaginationHelper.stringParam(query, 'status') as NotificationDeliveryStatus | null,
      channel: PaginationHelper.stringParam(query, 'channel') as NotificationChannel | null,
      userId: PaginationHelper.stringParam(query, 'userId'),
      from: PaginationHelper.stringParam(query, 'from'),
      to: PaginationHelper.stringParam(query, 'to')
    };

    const { rows, count } = await this.deliveryRepo.findAllForAdmin(filters, paginationParams);

    await audit.record('NOTIFICATION_DELIVERY_LIST_VIEWED', {
      actorId: adminUserId,
      details: { totalItems: count },
      entityType: 'NotificationDelivery',
      entityTable: 'notification_deliveries'
    });

    const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== null));
    return {
      data: rows.map(NotificationDeliveryListDTO),
      metadata: MetadataDTO.build({
        totalItems: count,
        page: paginationParams.page,
        limit: paginationParams.limit,
        sortBy: paginationParams.sortBy,
        order: paginationParams.order,
        filters: Object.keys(activeFilters).length > 0 ? activeFilters : undefined
      })
    };
  }

  async getById(notificationDeliveryId: string, adminUserId: string) {
    const record = await this.deliveryRepo.findByIdWithNotification(notificationDeliveryId);
    if (!record) {
      throw AppError.notFound('Entrega de notificación no encontrada');
    }

    await audit.record('NOTIFICATION_DELIVERY_VIEWED', {
      actorId: adminUserId,
      details: { notificationDeliveryId, notificationId: record.notificationId },
      entityId: notificationDeliveryId,
      entityType: 'NotificationDelivery',
      entityTable: 'notification_deliveries'
    });

    return NotificationDeliveryDetailDTO(record);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace AdminNotificationDeliveryService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    deliveryRepo?: typeof deliveryRepo;
  }
}

export default Object.assign(new AdminNotificationDeliveryService(), { AdminNotificationDeliveryService });
