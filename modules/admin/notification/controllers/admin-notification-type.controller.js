const NotificationTypeService = require('../services/admin-notification-type.service');
const ApiResponse = require('../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../shared/middlewares/error.middleware');

class NotificationTypeController {
  /** GET /notification-types */
  list = asyncHandler(async (req, res) => {
    const result = await NotificationTypeService.list(req.query, req.user.userId); // ✅ adminUserId
    return ApiResponse.success(res, 'Tipos de notificación obtenidos exitosamente', result);
  });

  /** PATCH /notification-types/:notificationTypeId */
  update = asyncHandler(async (req, res) => {
    const result = await NotificationTypeService.update(
      req.params.notificationTypeId,
      req.body,
      req.user.userId // ✅ adminUserId
    );
    return ApiResponse.success(res, 'Tipo de notificación actualizado exitosamente', result);
  });

  /** POST /notification-types/global */
  createGlobalNotification = asyncHandler(async (req, res) => {
    const result = await NotificationTypeService.createGlobalNotification(
      req.body,
      req.user.userId // ✅ adminUserId
    );
    return ApiResponse.success(res, 'Notificación global creada exitosamente', result, 201);
  });

  /** POST /notification-types/direct */
  createDirectNotification = asyncHandler(async (req, res) => {
    const result = await NotificationTypeService.createDirectNotification(
      req.body,
      req.user.userId // ✅ adminUserId
    );
    return ApiResponse.success(res, 'Notificación directa creada exitosamente', result, 201);
  });
}

module.exports = new NotificationTypeController();
