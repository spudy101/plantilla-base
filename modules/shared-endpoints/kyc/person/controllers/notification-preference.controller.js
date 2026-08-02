const NotificationPreferenceService = require('../services/notification-preference.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class NotificationPreferenceController {
  /** GET /person/notifications/preferences — preferencias crudas (global + overrides). */
  getPreferences = asyncHandler(async (req, res) => {
    const result = await NotificationPreferenceService.getPreferences(req.user.userId);
    return ApiResponse.success(res, 'Preferencias de notificación obtenidas exitosamente', result);
  });

  /** GET /person/notifications/preferences/categories — categorías con la preferencia efectiva. */
  getCategoriesWithPreferences = asyncHandler(async (req, res) => {
    const result = await NotificationPreferenceService.getCategoriesWithPreferences(req.user.userId);
    return ApiResponse.success(res, 'Categorías de notificación obtenidas exitosamente', result);
  });

  /** PUT /person/notifications/preferences/global */
  updateGlobalPreference = asyncHandler(async (req, res) => {
    const result = await NotificationPreferenceService.updateGlobalPreference(req.body, req.user.userId);
    return ApiResponse.success(res, 'Preferencia global actualizada exitosamente', result);
  });

  /** PUT /person/notifications/preferences/category/:categoryCode */
  updateCategoryPreference = asyncHandler(async (req, res) => {
    const result = await NotificationPreferenceService.updateCategoryPreference(
      req.params.categoryCode,
      req.body,
      req.user.userId
    );
    return ApiResponse.success(res, 'Preferencia de categoría actualizada exitosamente', result);
  });

  /** DELETE /person/notifications/preferences/category/:categoryCode */
  deleteCategoryPreference = asyncHandler(async (req, res) => {
    const result = await NotificationPreferenceService.deleteCategoryPreference(req.params.categoryCode, req.user.userId);
    return ApiResponse.success(res, 'Preferencia de categoría eliminada exitosamente', result);
  });
}

module.exports = new NotificationPreferenceController();
