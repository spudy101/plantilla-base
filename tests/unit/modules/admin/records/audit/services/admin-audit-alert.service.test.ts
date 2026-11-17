// tests/unit/modules/admin/records/audit/services/admin-audit-alert.service.test.ts
//
// AdminAuditAlertService — gestión de alertas de auditoría desde el panel admin. Probamos la
// orquestación: list() arma filtros + paginación y expone pendingCount; acknowledge() lanza 404 si
// no marcó nada y, si marcó, audita y devuelve el registro; acknowledgeBulk() reporta
// {acknowledged, requested}. Repos, DTOs, paginación, notificaciones y logger se mockean para
// aislar la lógica del servicio. La notificación se dispara en setImmediate → se vacía la cola de
// macrotareas antes de assertar.

jest.mock('modules/schemas/records/audit/repositories/audit-alert.repository', () => ({
  findAllFiltered: jest.fn(),
  countPending: jest.fn(),
  acknowledge: jest.fn(),
  acknowledgeBulk: jest.fn(),
  findById: jest.fn()
}));

jest.mock('modules/schemas/notification/services/notification-creation.service', () => ({
  crearNotificacion: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('shared/utils/logger.util', () => ({
  logAudit: jest.fn(),
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

// Paginación reducida a valores deterministas para no depender de su parsing interno.
jest.mock('shared/utils/pagination.util', () => ({
  stringParam: jest.requireActual('shared/utils/pagination.util').stringParam,
  booleanParam: jest.requireActual('shared/utils/pagination.util').booleanParam,
  getPaginationParams: jest.fn().mockReturnValue({ limit: 10, offset: 0, page: 1, sortBy: 'created_at', order: 'DESC' }),
  buildFilters: jest.fn().mockReturnValue({})
}));

jest.mock('shared/constants', () => ({
  notifications: { ses: { logoUrl: 'https://logo.test/x.png' } }
}));

// DTOs a identidad/passthrough para no acoplar a su forma interna.
jest.mock('shared/dtos/kyc/components-catalog.dto', () => ({
  MetadataDTO: { build: (meta: Loose) => ({ ...meta }) }
}));
jest.mock('modules/admin/records/audit/dtos/admin-audit-alert.dto', () => ({
  AuditAlertListDTO: (row: Loose) => ({ dto: true, ...row })
}));

import { mocked, Loose } from 'tests/helpers/mock';
import auditAlertRepoModule = require('modules/schemas/records/audit/repositories/audit-alert.repository');
const auditAlertRepo = mocked(auditAlertRepoModule);
import notificationCreationModule = require('modules/schemas/notification/services/notification-creation.service');
const notificationCreation = mocked(notificationCreationModule);
import loggerUtilModule = require('shared/utils/logger.util');
const { logAudit } = mocked(loggerUtilModule);
import service = require('modules/admin/records/audit/services/admin-audit-alert.service');

const ADMIN = 'admin-1';
const flushMacrotasks = () => new Promise(resolve => { setImmediate(resolve); });

describe('AdminAuditAlertService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('devuelve alertas mapeadas + metadata con pendingCount y audita el listado', async () => {
      auditAlertRepo.findAllFiltered.mockResolvedValue({
        rows: [{ audit_alert_id: 'a-1' }, { audit_alert_id: 'a-2' }],
        count: 2
      });
      auditAlertRepo.countPending.mockResolvedValue(5);

      const result = await service.list({ acknowledged: 'false' }, ADMIN);

      expect(auditAlertRepo.findAllFiltered).toHaveBeenCalledWith(
        // booleanParam normaliza el query (boolean del validator o string) → boolean para el repo
        expect.objectContaining({ acknowledged: false }),
        { limit: 10, offset: 0 }
      );
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({ dto: true, audit_alert_id: 'a-1' });
      expect(result.metadata).toMatchObject({ totalItems: 2, pendingCount: 5 });
      expect(logAudit).toHaveBeenCalledWith(
        'AUDIT_ALERT_LISTED',
        ADMIN,
        { totalItems: 2, pending: 5 },
        expect.objectContaining({ entityType: 'AuditAlert' })
      );
    });
  });

  describe('acknowledge', () => {
    it('lanza 404 si no marcó ninguna alerta', async () => {
      auditAlertRepo.acknowledge.mockResolvedValue([0]);

      await expect(service.acknowledge('a-1', ADMIN)).rejects.toMatchObject({ statusCode: 404 });
      expect(auditAlertRepo.findById).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('marca, audita, notifica (setImmediate) y devuelve el registro DTO', async () => {
      auditAlertRepo.acknowledge.mockResolvedValue([1]);
      auditAlertRepo.findById.mockResolvedValue({ audit_alert_id: 'a-1', acknowledged: true });

      const result = await service.acknowledge('a-1', ADMIN);

      expect(result).toMatchObject({ dto: true, audit_alert_id: 'a-1' });
      expect(logAudit).toHaveBeenCalledWith(
        'AUDIT_ALERT_ACKNOWLEDGED',
        ADMIN,
        { alertId: 'a-1' },
        expect.objectContaining({ entityId: 'a-1', entityType: 'AuditAlert' })
      );

      await flushMacrotasks();
      expect(notificationCreation.crearNotificacion).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'AUDIT_ALERT_ACKNOWLEDGED', userId: ADMIN })
      );
    });
  });

  describe('acknowledgeBulk', () => {
    it('reporta {acknowledged, requested} y audita el bulk', async () => {
      auditAlertRepo.acknowledgeBulk.mockResolvedValue([2]);

      const result = await service.acknowledgeBulk(['a-1', 'a-2', 'a-3'], ADMIN);

      expect(result).toEqual({ acknowledged: 2, requested: 3 });
      expect(logAudit).toHaveBeenCalledWith(
        'AUDIT_ALERTS_BULK_ACKNOWLEDGED',
        ADMIN,
        { requested: 3, acknowledged: 2 },
        expect.objectContaining({ entityType: 'AuditAlert' })
      );

      await flushMacrotasks();
      expect(notificationCreation.crearNotificacion).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'AUDIT_ALERTS_BULK_ACKNOWLEDGED', userId: ADMIN })
      );
    });
  });
});
