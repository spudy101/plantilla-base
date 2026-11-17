import NotificationPreferenceService from '../services/notification-preference.service';
import ApiResponse from '../../../../../shared/utils/app-response.util';
import errorMiddlewareModule from '../../../../../shared/middlewares/error.middleware';
const { asyncHandler } = errorMiddlewareModule;
import authUserUtilModule from '../../../../../shared/utils/auth-user.util';
const { requireAuthUser } = authUserUtilModule;
import routeParamUtilModule from '../../../../../shared/utils/route-param.util';
const { routeParam } = routeParamUtilModule;

class NotificationPreferenceController {
  /** GET /person/notifications/preferences — preferencias crudas (global + overrides). */
  getPreferences = asyncHandler(async (req, res) => {
    const result = await NotificationPreferenceService.getPreferences(requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Preferencias de notificación obtenidas exitosamente', result);
  });

  /** GET /person/notifications/preferences/categories — categorías con la preferencia efectiva. */
  getCategoriesWithPreferences = asyncHandler(async (req, res) => {
    const result = await NotificationPreferenceService.getCategoriesWithPreferences(requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Categorías de notificación obtenidas exitosamente', result);
  });

  /** PUT /person/notifications/preferences/global */
  updateGlobalPreference = asyncHandler(async (req, res) => {
    const result = await NotificationPreferenceService.updateGlobalPreference(req.body, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Preferencia global actualizada exitosamente', result);
  });

  /** PUT /person/notifications/preferences/category/:categoryCode */
  updateCategoryPreference = asyncHandler(async (req, res) => {
    const result = await NotificationPreferenceService.updateCategoryPreference(
      routeParam(req, 'categoryCode'),
      req.body,
      requireAuthUser(req).userId
    );
    return ApiResponse.success(res, 'Preferencia de categoría actualizada exitosamente', result);
  });

  /** DELETE /person/notifications/preferences/category/:categoryCode */
  deleteCategoryPreference = asyncHandler(async (req, res) => {
    const result = await NotificationPreferenceService.deleteCategoryPreference(routeParam(req, 'categoryCode'), requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Preferencia de categoría eliminada exitosamente', result);
  });
}

export default new NotificationPreferenceController();
