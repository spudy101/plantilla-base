import NotificationTypeService = require('../services/admin-notification-type.service');
import ApiResponse = require('../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;
import routeParamUtilModule = require('../../../../shared/utils/route-param.util');
const { routeParam } = routeParamUtilModule;
import authUserUtilModule = require('../../../../shared/utils/auth-user.util');
const { requireAuthUser } = authUserUtilModule;

class NotificationTypeController {
  /** GET /notification-types */
  list = asyncHandler(async (req, res) => {
    const result = await NotificationTypeService.list(req.query, requireAuthUser(req).userId); // ✅ adminUserId
    return ApiResponse.success(res, 'Tipos de notificación obtenidos exitosamente', result);
  });

  /** PATCH /notification-types/:notificationTypeId */
  update = asyncHandler(async (req, res) => {
    const result = await NotificationTypeService.update(
      routeParam(req, 'notificationTypeId'),
      req.body,
      requireAuthUser(req).userId // ✅ adminUserId
    );
    return ApiResponse.success(res, 'Tipo de notificación actualizado exitosamente', result);
  });

  /** POST /notification-types/global */
  createGlobalNotification = asyncHandler(async (req, res) => {
    const result = await NotificationTypeService.createGlobalNotification(
      req.body,
      requireAuthUser(req).userId // ✅ adminUserId
    );
    return ApiResponse.success(res, 'Notificación global creada exitosamente', result, 201);
  });

  /** POST /notification-types/direct */
  createDirectNotification = asyncHandler(async (req, res) => {
    const result = await NotificationTypeService.createDirectNotification(
      req.body,
      requireAuthUser(req).userId // ✅ adminUserId
    );
    return ApiResponse.success(res, 'Notificación directa creada exitosamente', result, 201);
  });
}

export = new NotificationTypeController();
