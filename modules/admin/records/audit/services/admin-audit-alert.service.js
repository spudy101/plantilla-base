const AppError = require('../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../shared/utils/logger.util');
const PaginationHelper = require('../../../../../shared/utils/pagination.util');
const { notifications } = require('../../../../../shared/constants');
const NotificationCreationService = require('../../../../schemas/notification/services/notification-creation.service');
const { MetadataDTO } = require('../../../../../shared/dtos/kyc/components-catalog.dto');
const auditAlertRepository = require('../../../../schemas/records/audit/repositories/audit-alert.repository');
const { AuditAlertListDTO } = require('../dtos/admin-audit-alert.dto');

class AdminAuditAlertService {
  async list(query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const { acknowledged, dateFrom, dateTo, action, category } = query;

    const { rows, count } = await auditAlertRepository.findAllFiltered(
      { acknowledged, dateFrom, dateTo, action, category },
      { limit: paginationParams.limit, offset: paginationParams.offset }
    );

    const pending = await auditAlertRepository.countPending();

    const activeFilters = PaginationHelper.buildFilters(query, ['acknowledged', 'dateFrom', 'dateTo', 'action', 'category']);

    logAudit(
      'AUDIT_ALERT_LISTED',
      adminUserId,
      { totalItems: count, pending },
      { entityType: 'AuditAlert', entityTable: 'audit_alerts' }
    );

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

  async acknowledge(alertId, adminUserId) {
    const [updated] = await auditAlertRepository.acknowledge(alertId, adminUserId);
    if (!updated) {
      throw AppError.notFound('Alerta no encontrada o ya estaba reconocida');
    }

    const record = await auditAlertRepository.findById(alertId);

    logAudit(
      'AUDIT_ALERT_ACKNOWLEDGED',
      adminUserId,
      { alertId },
      { entityId: alertId, entityType: 'AuditAlert', entityTable: 'audit_alerts' }
    );

    setImmediate(() => {
      NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'AUDIT_ALERT_ACKNOWLEDGED',
        userId: adminUserId,
        relatedEntity: { type: 'AuditAlert', id: alertId },
        metadata: { alertId, logoUrl: notifications.ses.logoUrl }
      }).catch(err => logger.warn('Error enviando AUDIT_ALERT_ACKNOWLEDGED', { error: err.message }));
    });

    return AuditAlertListDTO(record);
  }

  async acknowledgeBulk(alertIds, adminUserId) {
    const [count] = await auditAlertRepository.acknowledgeBulk(alertIds, adminUserId);

    logAudit(
      'AUDIT_ALERTS_BULK_ACKNOWLEDGED',
      adminUserId,
      { requested: alertIds.length, acknowledged: count },
      { entityType: 'AuditAlert', entityTable: 'audit_alerts' }
    );

    setImmediate(() => {
      NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'AUDIT_ALERTS_BULK_ACKNOWLEDGED',
        userId: adminUserId,
        relatedEntity: null,
        metadata: { acknowledged: count, total: alertIds.length, logoUrl: notifications.ses.logoUrl }
      }).catch(err => logger.warn('Error enviando AUDIT_ALERTS_BULK_ACKNOWLEDGED', { error: err.message }));
    });

    return { acknowledged: count, requested: alertIds.length };
  }
}

module.exports = new AdminAuditAlertService();
