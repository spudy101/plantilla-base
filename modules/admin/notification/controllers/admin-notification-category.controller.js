const NotificationCategoryService = require('../services/admin-notification-category.service');
const ApiResponse = require('../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../shared/middlewares/error.middleware');

class NotificationCategoryController {
  /** GET /notification-categories */
  list = asyncHandler(async (req, res) => {
    const result = await NotificationCategoryService.list(req.query, req.user.userId);
    return ApiResponse.success(res, 'Categorías de notificación obtenidas exitosamente', result);
  });

  /** GET /notification-categories/:notificationCategoryId */
  getById = asyncHandler(async (req, res) => {
    const result = await NotificationCategoryService.getById(req.params.notificationCategoryId, req.user.userId);
    return ApiResponse.success(res, 'Categoría de notificación obtenida exitosamente', result);
  });

  /** POST /notification-categories */
  create = asyncHandler(async (req, res) => {
    const result = await NotificationCategoryService.create(req.body, req.user.userId);
    return ApiResponse.success(res, 'Categoría de notificación creada exitosamente', result, 201);
  });

  /** PATCH /notification-categories/:notificationCategoryId */
  update = asyncHandler(async (req, res) => {
    const result = await NotificationCategoryService.update(req.params.notificationCategoryId, req.body, req.user.userId);
    return ApiResponse.success(res, 'Categoría de notificación actualizada exitosamente', result);
  });

  /** DELETE /notification-categories/:notificationCategoryId */
  remove = asyncHandler(async (req, res) => {
    const result = await NotificationCategoryService.remove(req.params.notificationCategoryId, req.user.userId);
    return ApiResponse.success(res, 'Categoría de notificación eliminada exitosamente', result);
  });
}

module.exports = new NotificationCategoryController();
