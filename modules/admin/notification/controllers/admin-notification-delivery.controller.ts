import AdminNotificationDeliveryService from '../services/admin-notification-delivery.service';
import ApiResponse from '../../../../shared/utils/app-response.util';
import errorMiddlewareModule from '../../../../shared/middlewares/error.middleware';
const { asyncHandler } = errorMiddlewareModule;
import routeParamUtilModule from '../../../../shared/utils/route-param.util';
const { routeParam } = routeParamUtilModule;
import authUserUtilModule from '../../../../shared/utils/auth-user.util';
const { requireAuthUser } = authUserUtilModule;

class AdminNotificationDeliveryController {
  list = asyncHandler(async (req, res) => {
    const result = await AdminNotificationDeliveryService.list(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Entregas de notificaciones obtenidas exitosamente', result);
  });

  metrics = asyncHandler(async (req, res) => {
    const data = await AdminNotificationDeliveryService.metrics(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Métricas de entregas de notificaciones obtenidas exitosamente', data);
  });

  getById = asyncHandler(async (req, res) => {
    const data = await AdminNotificationDeliveryService.getById(routeParam(req, 'id'), requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Notificación obtenida exitosamente', data);
  });

  retry = asyncHandler(async (req, res) => {
    const requested = req.query.channel;
    const channel = requested === 'email' || requested === 'push' || requested === 'sms' ? requested : 'all';
    const data = await AdminNotificationDeliveryService.retry(routeParam(req, 'id'), channel, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Reintento de entrega iniciado', data);
  });
}

export default new AdminNotificationDeliveryController();
