const AdminNotificationDeliveryService = require('../services/admin-notification-delivery.service');
const ApiResponse = require('../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../shared/middlewares/error.middleware');

class AdminNotificationDeliveryController {
  list = asyncHandler(async (req, res) => {
    const result = await AdminNotificationDeliveryService.list(req.query, req.user.userId);
    return ApiResponse.success(res, 'Entregas de notificaciones obtenidas exitosamente', result);
  });

  metrics = asyncHandler(async (req, res) => {
    const data = await AdminNotificationDeliveryService.metrics(req.query, req.user.userId);
    return ApiResponse.success(res, 'Métricas de entregas de notificaciones obtenidas exitosamente', data);
  });

  getById = asyncHandler(async (req, res) => {
    const data = await AdminNotificationDeliveryService.getById(req.params.id, req.user.userId);
    return ApiResponse.success(res, 'Notificación obtenida exitosamente', data);
  });

  retry = asyncHandler(async (req, res) => {
    const channel = req.query.channel || 'all';
    const data = await AdminNotificationDeliveryService.retry(req.params.id, channel, req.user.userId);
    return ApiResponse.success(res, 'Reintento de entrega iniciado', data);
  });
}

module.exports = new AdminNotificationDeliveryController();
