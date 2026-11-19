import AdminNotificationDeliveryService from '../services/admin-notification-delivery.service';
import ApiResponse from '../../../shared/http/app-response.util';
import errorMiddlewareModule from '../../../shared/http/error.middleware';
const { asyncHandler } = errorMiddlewareModule;
import routeParamUtilModule from '../../../shared/http/route-param.util';
const { routeParam } = routeParamUtilModule;
import authUserUtilModule from '../../../shared/http/auth-user.util';
const { requireAuthUser } = authUserUtilModule;

class AdminNotificationDeliveryController {
  list = asyncHandler(async (req, res) => {
    const result = await AdminNotificationDeliveryService.list(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Entregas de notificaciones obtenidas exitosamente', result);
  });

  getById = asyncHandler(async (req, res) => {
    const data = await AdminNotificationDeliveryService.getById(routeParam(req, 'id'), requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Entrega obtenida exitosamente', data);
  });
}

export default new AdminNotificationDeliveryController();
