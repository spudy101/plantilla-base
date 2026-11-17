// tests/unit/modules/admin/notification/services/admin-notification-delivery.service.test.js
//
// AdminNotificationDeliveryService — panel de observabilidad de ENTREGAS de notificaciones.
// Probamos la orquestación de list (filtros activos + paginación + auditoría), metrics, getById
// (404 vs DTO) y, sobre todo, retry: 404 si no existe, badRequest si ya está COMPLETED, badRequest
// si ningún canal es reintentable, y el camino feliz que resetea el registro, audita, responde
// retry_initiated y dispara el reenvío en setImmediate (override de quiet hours). Repos, sending
// service, notification-creation, paginación y DTOs se mockean; AppError es el real para conservar
// statusCode. Las macrotareas (setImmediate) se vacían antes de assertar sus efectos.

jest.mock('modules/schemas/notification/repositories/notification.repository', () => ({
  findAllForAdmin: jest.fn(),
  deliveryMetrics: jest.fn(),
  findByIdWithType: jest.fn(),
  resetForRetry: jest.fn().mockResolvedValue(undefined),
  updateProcessingStatus: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/notification/repositories/notification-type.repository', () => ({
  findById: jest.fn()
}));

jest.mock('modules/schemas/notification/services/notification-sending.service', () => ({
  enviarEmailIndividual: jest.fn().mockResolvedValue(undefined),
  enviarPushIndividual: jest.fn().mockResolvedValue(undefined),
  enviarSmsIndividual: jest.fn().mockResolvedValue(undefined),
  actualizarEstadoEntrega: jest.fn().mockResolvedValue('completed')
}));

jest.mock('modules/schemas/notification/services/notification-creation.service', () => ({
  crearNotificacion: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('shared/utils/pagination.util', () => ({
  stringParam: jest.requireActual('shared/utils/pagination.util').stringParam,
  booleanParam: jest.requireActual('shared/utils/pagination.util').booleanParam,
  getPaginationParams: jest.fn().mockReturnValue({ limit: 10, offset: 0, page: 1, sortBy: 'created_at', order: 'DESC' })
}));

jest.mock('shared/dtos/kyc/components-catalog.dto', () => ({
  MetadataDTO: { build: meta => ({ ...meta }) }
}));

jest.mock('modules/admin/notification/dtos/admin-notification-delivery.dto', () => ({
  NotificationDeliveryListDTO: row => ({ dto: 'list', id: row.notification_id }),
  NotificationDeliveryDetailDTO: row => ({ dto: 'detail', id: row.notification_id }),
  NotificationDeliveryMetricsDTO: (rows, range) => ({ dto: 'metrics', total: rows.length, range })
}));

jest.mock('shared/utils/logger.util', () => ({
  logAudit: jest.fn(),
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('shared/constants', () => ({
  notifications: { ses: { logoUrl: 'https://logo.test/x.png' } }
}));

jest.mock('shared/models', () => ({}));

const notificationRepo = require('modules/schemas/notification/repositories/notification.repository');
const notificationTypeRepo = require('modules/schemas/notification/repositories/notification-type.repository');
const sendingService = require('modules/schemas/notification/services/notification-sending.service');
const notificationCreation = require('modules/schemas/notification/services/notification-creation.service');
const { logAudit } = require('shared/utils/logger.util');
const service = require('modules/admin/notification/services/admin-notification-delivery.service');

const ADMIN = 'admin-1';
const flush = () => new Promise(resolve => { setImmediate(resolve); });

describe('AdminNotificationDeliveryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('mapea filas, deja solo filtros activos en metadata y audita', async () => {
      notificationRepo.findAllForAdmin.mockResolvedValue({
        rows: [{ notification_id: 'n-1' }, { notification_id: 'n-2' }],
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
      notificationRepo.findByIdWithType.mockResolvedValue({ notification_id: 'n-1' });

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
      notificationRepo.findByIdWithType.mockResolvedValue({ processing_status: 'completed' });

      await expect(service.retry('n-1', 'all', ADMIN)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('lanza badRequest si ningún canal es reintentable', async () => {
      notificationRepo.findByIdWithType.mockResolvedValue({
        processing_status: 'partial_failure',
        email_sent: true, push_sent: true, sms_sent: true
      });

      await expect(service.retry('n-1', 'all', ADMIN)).rejects.toMatchObject({ statusCode: 400 });
      expect(notificationRepo.resetForRetry).not.toHaveBeenCalled();
    });

    it('camino feliz (email): resetea, audita, responde retry_initiated y reenvía en setImmediate', async () => {
      const notification = {
        notification_id: 'n-1',
        user_id: 'u-1',
        processing_status: 'partial_failure',
        // email falló de forma reintentable (tiene error y fecha de próximo reintento)
        email_sent: false, email_error: 'timeout', email_next_retry_at: new Date(),
        push_sent: true, push_error: null, push_next_retry_at: null,
        sms_sent: true, sms_error: null, sms_next_retry_at: null,
        metadata: { foo: 'bar' },
        title: 'T', body: 'B',
        notification_type: { code: 'X', category: { supports_email: true } }
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
      expect(sendingService.enviarEmailIndividual).toHaveBeenCalledWith('u-1', notification.notification_type, { foo: 'bar' }, 'n-1');
      expect(sendingService.enviarPushIndividual).not.toHaveBeenCalled();
      expect(sendingService.actualizarEstadoEntrega).toHaveBeenCalledWith('n-1', notification.notification_type);
    });

    it('marca FAILED si el reenvío en setImmediate lanza error', async () => {
      const notification = {
        notification_id: 'n-2',
        user_id: 'u-2',
        processing_status: 'partial_failure',
        email_sent: false, email_error: 'timeout', email_next_retry_at: new Date(),
        push_sent: true, sms_sent: true,
        metadata: null,
        notification_type: { code: 'X', category: { supports_email: true } }
      };
      notificationRepo.findByIdWithType.mockResolvedValue(notification);
      sendingService.enviarEmailIndividual.mockRejectedValueOnce(new Error('send fail'));

      await service.retry('n-2', 'email', ADMIN);
      await flush();

      expect(notificationRepo.updateProcessingStatus).toHaveBeenCalledWith('n-2', 'failed');
    });

    it('resuelve la categoría desde el repo si el tipo no la trae embebida', async () => {
      const notification = {
        notification_id: 'n-3',
        user_id: 'u-3',
        processing_status: 'failed',
        // nada explícito falló pero processing_status=failed y sin canales cerrados → 'all'
        email_sent: false, push_sent: false, sms_sent: false,
        email_error: null, push_error: null, sms_error: null,
        email_next_retry_at: null, push_next_retry_at: null, sms_next_retry_at: null,
        metadata: {},
        title: 'T', body: 'B',
        notification_type: null,
        notification_type_id: 'nt-1'
      };
      notificationRepo.findByIdWithType.mockResolvedValue(notification);
      notificationTypeRepo.findById.mockResolvedValue({ code: 'Y', category: { supports_email: true, supports_sms: false } });

      const result = await service.retry('n-3', 'all', ADMIN);

      expect(result.channel).toBe('all');
      expect(notificationTypeRepo.findById).toHaveBeenCalledWith('nt-1', expect.any(Object));

      await flush();
      expect(sendingService.enviarEmailIndividual).toHaveBeenCalled();
      // supports_sms=false → no se envía SMS aunque el canal efectivo sea 'all'
      expect(sendingService.enviarSmsIndividual).not.toHaveBeenCalled();
    });
  });
});
