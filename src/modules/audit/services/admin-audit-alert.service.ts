import AppError from '../../../shared/http/app-error.util';
import loggerUtilModule from '../../../shared/observability/logger.util';
const { logger } = loggerUtilModule;
import PaginationHelper from '../../../shared/http/pagination.util';
import constantsModule from '../../../shared/constants';
const { notifications } = constantsModule;
import NotificationCreationService from '../../notification/services/notification-creation.service';
import componentsCatalogDtoModule from '../../catalogs/dtos/catalog-components.dto';
const { MetadataDTO } = componentsCatalogDtoModule;
import auditAlertRepository from '../repositories/audit-alert.repository';
import adminAuditAlertDtoModule from '../dtos/admin-audit-alert.dto';
const { AuditAlertListDTO } = adminAuditAlertDtoModule;
import audit from '../audit.service';

class AdminAuditAlertService {
  NotificationCreationService: typeof NotificationCreationService;
  auditAlertRepository: typeof auditAlertRepository;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new AdminAuditAlertService({ NotificationCreationService: fake })
   * @param {object} [deps]
   */
  constructor(deps: AdminAuditAlertService.Deps = {}) {
    this.NotificationCreationService = deps.NotificationCreationService ?? NotificationCreationService;
    this.auditAlertRepository = deps.auditAlertRepository ?? auditAlertRepository;
  }

  async list(query: Record<string, unknown>, adminUserId: string) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const acknowledged = PaginationHelper.booleanParam(query, 'acknowledged');
    const { rows, count } = await this.auditAlertRepository.findAllFiltered(
      {
        acknowledged,
        dateFrom: PaginationHelper.stringParam(query, 'dateFrom') ?? undefined,
        dateTo: PaginationHelper.stringParam(query, 'dateTo') ?? undefined,
        action: PaginationHelper.stringParam(query, 'action') ?? undefined,
        category: PaginationHelper.stringParam(query, 'category') ?? undefined
      },
      { limit: paginationParams.limit, offset: paginationParams.offset }
    );

    const pending = await this.auditAlertRepository.countPending();

    const activeFilters = PaginationHelper.buildFilters(query, ['acknowledged', 'dateFrom', 'dateTo', 'action', 'category']);

    await audit.record('AUDIT_ALERT_LISTED', {
      actorId: adminUserId,
      details: { totalItems: count, pending },
      entityType: 'AuditAlert',
      entityTable: 'audit_alerts'
    });

    return {
      data: rows.map(r => AuditAlertListDTO(r)),
      metadata: {
        ...MetadataDTO.build({
          totalItems: count,
          page: paginationParams.page,
          limit: paginationParams.limit,
          sortBy: paginationParams.sortBy,
          order: paginationParams.order,
          filters: Object.keys(activeFilters).length > 0 ? activeFilters : undefined
        }),
        pendingCount: pending
      }
    };
  }

  async acknowledge(alertId: string, adminUserId: string) {
    const updated = await this.auditAlertRepository.acknowledge(alertId, adminUserId);
    if (!updated) {
      throw AppError.notFound('Alerta no encontrada o ya estaba reconocida');
    }

    const record = await this.auditAlertRepository.findById(alertId);

    await audit.record('AUDIT_ALERT_ACKNOWLEDGED', {
      actorId: adminUserId,
      details: { alertId },
      entityId: alertId,
      entityType: 'AuditAlert',
      entityTable: 'audit_alerts'
    });

    setImmediate(() => {
      this.NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'AUDIT_ALERT_ACKNOWLEDGED',
        userId: adminUserId,
        relatedEntity: { type: 'AuditAlert', id: alertId },
        metadata: { alertId, logoUrl: notifications.ses.logoUrl }
      }).catch(err => logger.warn('Error enviando AUDIT_ALERT_ACKNOWLEDGED', { error: err.message }));
    });

    return AuditAlertListDTO(record);
  }

  async acknowledgeBulk(alertIds: string[], adminUserId: string) {
    const count = await this.auditAlertRepository.acknowledgeBulk(alertIds, adminUserId);

    await audit.record('AUDIT_ALERTS_BULK_ACKNOWLEDGED', {
      actorId: adminUserId,
      details: { requested: alertIds.length, acknowledged: count },
      entityType: 'AuditAlert',
      entityTable: 'audit_alerts'
    });

    setImmediate(() => {
      this.NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'AUDIT_ALERTS_BULK_ACKNOWLEDGED',
        userId: adminUserId,
        relatedEntity: null,
        metadata: { acknowledged: count, total: alertIds.length, logoUrl: notifications.ses.logoUrl }
      }).catch(err => logger.warn('Error enviando AUDIT_ALERTS_BULK_ACKNOWLEDGED', { error: err.message }));
    });

    return { acknowledged: count, requested: alertIds.length };
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace AdminAuditAlertService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    NotificationCreationService?: typeof NotificationCreationService;
    auditAlertRepository?: typeof auditAlertRepository;
  }
}

export default Object.assign(new AdminAuditAlertService(), { AdminAuditAlertService });
