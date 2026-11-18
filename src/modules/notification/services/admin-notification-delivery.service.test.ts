// tests/unit/modules/admin/notification/services/admin-notification-delivery.service.test.ts
//
// AdminNotificationDeliveryService — panel de observabilidad de ENTREGAS de notificaciones.
// Probamos la orquestación de list (filtros activos + paginación + auditoría), metrics, getById
// (404 vs DTO) y, sobre todo, retry: 404 si no existe, badRequest si ya está COMPLETED, badRequest
// si ningún canal es reintentable, y el camino feliz que resetea el registro, audita, responde
// retry_initiated y dispara el reenvío en setImmediate (override de quiet hours). Repos, sending
// service, notification-creation, paginación y DTOs se mockean; AppError es el real para conservar
// statusCode. Las macrotareas (setImmediate) se vacían antes de assertar sus efectos.

jest.mock('../repositories/notification.repository', () => ({
  findAllForAdmin: jest.fn(),
  deliveryMetrics: jest.fn(),
  findByIdWithType: jest.fn(),
  resetForRetry: jest.fn().mockResolvedValue(undefined),
  updateProcessingStatus: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../repositories/notification-type.repository', () => ({
  findById: jest.fn()
}));

jest.mock('./notification-sending.service', () => ({
  enviarEmailIndividual: jest.fn().mockResolvedValue(undefined),
  enviarPushIndividual: jest.fn().mockResolvedValue(undefined),
  enviarSmsIndividual: jest.fn().mockResolvedValue(undefined),
  actualizarEstadoEntrega: jest.fn().mockResolvedValue('completed')
}));

jest.mock('./notification-creation.service', () => ({
  crearNotificacion: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../../shared/http/pagination.util', () => ({
  stringParam: jest.requireActual('../../../shared/http/pagination.util').default.stringParam,
  booleanParam: jest.requireActual('../../../shared/http/pagination.util').default.booleanParam,
  getPaginationParams: jest.fn().mockReturnValue({ limit: 10, offset: 0, page: 1, sortBy: 'created_at', order: 'DESC' })
}));

jest.mock('../../catalogs/dtos/catalog-components.dto', () => ({
  MetadataDTO: { build: (meta: Loose) => ({ ...meta }) }
}));

jest.mock('../dtos/admin-notification-delivery.dto', () => ({
  NotificationDeliveryListDTO: (row: Loose) => ({ dto: 'list', id: row.notificationId }),
  NotificationDeliveryDetailDTO: (row: Loose) => ({ dto: 'detail', id: row.notificationId }),
  NotificationDeliveryMetricsDTO: (rows: Loose, range: Loose) => ({ dto: 'metrics', total: rows.length, range })
}));

jest.mock('../../../shared/observability/logger.util', () => ({
  logAudit: jest.fn(),
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../../shared/constants', () => ({
  notifications: { ses: { logoUrl: 'https://logo.test/x.png' } }
}));


import { mocked, Loose } from 'tests/helpers/mock';
import notificationRepoModule from '../repositories/notification.repository';
const notificationRepo = mocked(notificationRepoModule);
import notificationTypeRepoModule from '../repositories/notification-type.repository';
const notificationTypeRepo = mocked(notificationTypeRepoModule);
import sendingServiceModule from './notification-sending.service';
const sendingService = mocked(sendingServiceModule);
import notificationCreationModule from './notification-creation.service';
const notificationCreation = mocked(notificationCreationModule);
import loggerUtilModule from '../../../shared/observability/logger.util';
const { logAudit } = mocked(loggerUtilModule);
import service from './admin-notification-delivery.service';

const ADMIN = 'admin-1';
const flush = () => new Promise(resolve => { setImmediate(resolve); });

describe('AdminNotificationDeliveryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('mapea filas, deja solo filtros activos en metadata y audita', async () => {
      notificationRepo.findAllForAdmin.mockResolvedValue({
        rows: [{ notificationId: 'n-1' }, { notificationId: 'n-2' }],
        count: 2
      });

      const result = await service.list({ channel: 'email' }, ADMIN);

      expect(notificationRepo.findAllForAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'email' }),
        expect.objectContaining({ limit: 10 })
      );
      expect(result.data).toEqual([{ dto: 'list', id: 'n-1' }, { dto: 'list', id: 'n-2' }]);
      // filters solo contiene channel (los null se descartan)
      expect(result.metadata.filters).toEqual({ channel: 'email' });
      expect(logAudit).toHaveBeenCalledWith(
        'NOTIFICATION_DELIVERY_LIST_VIEWED',
        ADMIN,
        { totalItems: 2 },
        expect.objectContaining({ entityType: 'Notification' })
      );
    });

    it('omite filters cuando no hay ninguno activo', async () => {
      notificationRepo.findAllForAdmin.mockResolvedValue({ rows: [], count: 0 });

      const result = await service.list({}, ADMIN);

      expect(result.metadata.filters).toBeUndefined();
    });
  });

  describe('metrics', () => {
    it('calcula métricas vía DTO y audita el total y el rango', async () => {
      notificationRepo.deliveryMetrics.mockResolvedValue([{ total: 3 }, { total: 1 }]);

      const result = await service.metrics({ from: '2026-01-01', to: '2026-02-01' }, ADMIN);

      expect(notificationRepo.deliveryMetrics).toHaveBeenCalledWith({ from: '2026-01-01', to: '2026-02-01', userId: null });
      expect(result).toMatchObject({ dto: 'metrics', total: 2 });
      expect(logAudit).toHaveBeenCalledWith(
        'NOTIFICATION_DELIVERY_METRICS_VIEWED',
        ADMIN,
        expect.objectContaining({ from: '2026-01-01', to: '2026-02-01' }),
        expect.any(Object)
      );
    });
  });

  describe('getById', () => {
    it('lanza 404 si la notificación no existe', async () => {
      notificationRepo.findByIdWithType.mockResolvedValue(null);

      await expect(service.getById('n-x', ADMIN)).rejects.toMatchObject({ statusCode: 404 });
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('devuelve el detalle DTO y audita la vista', async () => {
      notificationRepo.findByIdWithType.mockResolvedValue({ notificationId: 'n-1' });

      const result = await service.getById('n-1', ADMIN);

      expect(result).toEqual({ dto: 'detail', id: 'n-1' });
      expect(logAudit).toHaveBeenCalledWith(
        'NOTIFICATION_DELIVERY_VIEWED',
        ADMIN,
        { notificationId: 'n-1' },
        expect.objectContaining({ entityId: 'n-1' })
      );
    });
  });

  describe('retry', () => {
    it('lanza 404 si la notificación no existe', async () => {
      notificationRepo.findByIdWithType.mockResolvedValue(null);

      await expect(service.retry('n-x', 'all', ADMIN)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('lanza badRequest si ya fue entregada (COMPLETED)', async () => {
      notificationRepo.findByIdWithType.mockResolvedValue({ processingStatus: 'completed' });

      await expect(service.retry('n-1', 'all', ADMIN)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('lanza badRequest si ningún canal es reintentable', async () => {
      notificationRepo.findByIdWithType.mockResolvedValue({
        processingStatus: 'partial_failure',
        emailSent: true, pushSent: true, smsSent: true
      });

      await expect(service.retry('n-1', 'all', ADMIN)).rejects.toMatchObject({ statusCode: 400 });
      expect(notificationRepo.resetForRetry).not.toHaveBeenCalled();
    });

    it('camino feliz (email): resetea, audita, responde retry_initiated y reenvía en setImmediate', async () => {
      const notification = {
        notificationId: 'n-1',
        userId: 'u-1',
        processingStatus: 'partial_failure',
        // email falló de forma reintentable (tiene error y fecha de próximo reintento)
        emailSent: false, emailError: 'timeout', emailNextRetryAt: new Date(),
        pushSent: true, pushError: null, pushNextRetryAt: null,
        smsSent: true, smsError: null, smsNextRetryAt: null,
        metadata: { foo: 'bar' },
        title: 'T', body: 'B',
        notificationType: { code: 'X', category: { supportsEmail: true } }
      };
      notificationRepo.findByIdWithType.mockResolvedValue(notification);

      const result = await service.retry('n-1', 'email', ADMIN);

      expect(notificationRepo.resetForRetry).toHaveBeenCalledWith('n-1', 'email');
      expect(result).toEqual({ notificationId: 'n-1', channel: 'email', status: 'retry_initiated' });
      expect(logAudit).toHaveBeenCalledWith(
        'NOTIFICATION_DELIVERY_RETRY_REQUESTED',
        ADMIN,
        { notificationId: 'n-1', channel: 'email' },
        expect.objectContaining({ entityId: 'n-1' })
      );

      await flush();
      expect(notificationCreation.crearNotificacion).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'NOTIFICATION_RETRY_REQUESTED' })
      );
      expect(sendingService.enviarEmailIndividual).toHaveBeenCalledWith('u-1', notification.notificationType, { foo: 'bar' }, 'n-1');
      expect(sendingService.enviarPushIndividual).not.toHaveBeenCalled();
      expect(sendingService.actualizarEstadoEntrega).toHaveBeenCalledWith('n-1', notification.notificationType);
    });

    it('marca FAILED si el reenvío en setImmediate lanza error', async () => {
      const notification = {
        notificationId: 'n-2',
        userId: 'u-2',
        processingStatus: 'partial_failure',
        emailSent: false, emailError: 'timeout', emailNextRetryAt: new Date(),
        pushSent: true, smsSent: true,
        metadata: null,
        notificationType: { code: 'X', category: { supportsEmail: true } }
      };
      notificationRepo.findByIdWithType.mockResolvedValue(notification);
      sendingService.enviarEmailIndividual.mockRejectedValueOnce(new Error('send fail'));

      await service.retry('n-2', 'email', ADMIN);
      await flush();

      expect(notificationRepo.updateProcessingStatus).toHaveBeenCalledWith('n-2', 'failed');
    });

    it('resuelve la categoría desde el repo si el tipo no la trae embebida', async () => {
      const notification = {
        notificationId: 'n-3',
        userId: 'u-3',
        processingStatus: 'failed',
        // nada explícito falló pero processing_status=failed y sin canales cerrados → 'all'
        emailSent: false, pushSent: false, smsSent: false,
        emailError: null, pushError: null, smsError: null,
        emailNextRetryAt: null, pushNextRetryAt: null, smsNextRetryAt: null,
        metadata: {},
        title: 'T', body: 'B',
        notificationType: null,
        notificationTypeId: 'nt-1'
      };
      notificationRepo.findByIdWithType.mockResolvedValue(notification);
      notificationTypeRepo.findById.mockResolvedValue({ code: 'Y', category: { supportsEmail: true, supportsSms: false } });

      const result = await service.retry('n-3', 'all', ADMIN);

      expect(result.channel).toBe('all');
      expect(notificationTypeRepo.findById).toHaveBeenCalledWith('nt-1');

      await flush();
      expect(sendingService.enviarEmailIndividual).toHaveBeenCalled();
      // supports_sms=false → no se envía SMS aunque el canal efectivo sea 'all'
      expect(sendingService.enviarSmsIndividual).not.toHaveBeenCalled();
    });
  });
});
