import NotificationCategoryService = require('../services/admin-notification-category.service');
import ApiResponse = require('../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;
import routeParamUtilModule = require('../../../../shared/utils/route-param.util');
const { routeParam } = routeParamUtilModule;
import authUserUtilModule = require('../../../../shared/utils/auth-user.util');
const { requireAuthUser } = authUserUtilModule;

class NotificationCategoryController {
  /** GET /notification-categories */
  list = asyncHandler(async (req, res) => {
    const result = await NotificationCategoryService.list(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Categorías de notificación obtenidas exitosamente', result);
  });

  /** GET /notification-categories/:notificationCategoryId */
  getById = asyncHandler(async (req, res) => {
    const result = await NotificationCategoryService.getById(routeParam(req, 'notificationCategoryId'), requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Categoría de notificación obtenida exitosamente', result);
  });

  /** POST /notification-categories */
  create = asyncHandler(async (req, res) => {
    const result = await NotificationCategoryService.create(req.body, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Categoría de notificación creada exitosamente', result, 201);
  });

  /** PATCH /notification-categories/:notificationCategoryId */
  update = asyncHandler(async (req, res) => {
    const result = await NotificationCategoryService.update(routeParam(req, 'notificationCategoryId'), req.body, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Categoría de notificación actualizada exitosamente', result);
  });

  /** DELETE /notification-categories/:notificationCategoryId */
  remove = asyncHandler(async (req, res) => {
    const result = await NotificationCategoryService.remove(routeParam(req, 'notificationCategoryId'), requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Categoría de notificación eliminada exitosamente', result);
  });
}

export = new NotificationCategoryController();
