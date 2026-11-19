// AdminNotificationDeliveryService — consulta (solo lectura) de las entregas por canal: list (filtros
// activos + paginación + auditoría) y getById (404 vs DTO). Repo, paginación y DTOs se mockean.

jest.mock('../repositories/notification-delivery.repository', () => ({
  findAllForAdmin: jest.fn(),
  findByIdWithNotification: jest.fn()
}));

jest.mock('../../../shared/http/pagination.util', () => ({
  stringParam: jest.requireActual('../../../shared/http/pagination.util').default.stringParam,
  getPaginationParams: jest.fn().mockReturnValue({ limit: 10, offset: 0, page: 1, sortBy: 'created_at', order: 'DESC' })
}));

jest.mock('../../catalogs/responses/catalog-components.response', () => ({
  MetadataDTO: { build: (meta: Loose) => ({ ...meta }) }
}));

jest.mock('../responses/admin-notification-delivery.response', () => ({
  NotificationDeliveryListDTO: (row: Loose) => ({ dto: 'list', id: row.notificationDeliveryId }),
  NotificationDeliveryDetailDTO: (row: Loose) => ({ dto: 'detail', id: row.notificationDeliveryId })
}));

jest.mock('../../../shared/observability/logger.util', () => ({
  logAudit: jest.fn(),
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../audit/audit.service', () => ({ record: jest.fn() }));

import { mocked, Loose } from 'tests/helpers/mock';
import deliveryRepoModule from '../repositories/notification-delivery.repository';
const deliveryRepo = mocked(deliveryRepoModule);
import auditServiceModule from '../../audit/audit.service';
const logAudit = mocked(auditServiceModule).record;
import service from './admin-notification-delivery.service';

beforeEach(() => jest.clearAllMocks());

describe('list', () => {
  it('pasa solo los filtros presentes, mapea las filas y audita', async () => {
    deliveryRepo.findAllForAdmin.mockResolvedValue({ rows: [{ notificationDeliveryId: 'd-1' }], count: 1 });

    const result = await service.list({ status: 'failed', channel: 'email' }, 'admin-1');

    expect(deliveryRepo.findAllForAdmin).toHaveBeenCalledWith(
      { status: 'failed', channel: 'email', userId: null, from: null, to: null },
      expect.objectContaining({ limit: 10, offset: 0 })
    );
    expect(result.data).toEqual([{ dto: 'list', id: 'd-1' }]);
    expect(result.metadata).toMatchObject({ totalItems: 1, filters: { status: 'failed', channel: 'email' } });
    expect(logAudit).toHaveBeenCalledWith(
      'NOTIFICATION_DELIVERY_LIST_VIEWED',
      expect.objectContaining({ actorId: 'admin-1', details: { totalItems: 1 } })
    );
  });

  it('sin filtros no informa filters', async () => {
    deliveryRepo.findAllForAdmin.mockResolvedValue({ rows: [], count: 0 });
    const result = await service.list({}, 'admin-1');
    expect(result.metadata.filters).toBeUndefined();
  });
});

describe('getById', () => {
  it('404 si la entrega no existe', async () => {
    deliveryRepo.findByIdWithNotification.mockResolvedValue(null);
    await expect(service.getById('d-x', 'admin-1')).rejects.toMatchObject({ statusCode: 404 });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('devuelve el detalle y audita la consulta', async () => {
    deliveryRepo.findByIdWithNotification.mockResolvedValue({ notificationDeliveryId: 'd-1', notificationId: 'n-1' });

    await expect(service.getById('d-1', 'admin-1')).resolves.toEqual({ dto: 'detail', id: 'd-1' });
    expect(logAudit).toHaveBeenCalledWith(
      'NOTIFICATION_DELIVERY_VIEWED',
      expect.objectContaining({
        actorId: 'admin-1',
        entityId: 'd-1',
        details: { notificationDeliveryId: 'd-1', notificationId: 'n-1' }
      })
    );
  });
});
