const AdminUserConsentService = require('../services/admin-user-consent.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class AdminUserConsentController {
  list = asyncHandler(async (req, res) => {
    const result = await AdminUserConsentService.list(req.query, req.user.userId);
    return ApiResponse.success(res, 'Consentimientos obtenidos exitosamente', result);
  });

  getHistoryByUser = asyncHandler(async (req, res) => {
    const result = await AdminUserConsentService.getHistoryByUser(req.params.userId, req.query, req.user.userId);
    return ApiResponse.success(res, 'Historial de consentimientos obtenido exitosamente', result);
  });
}

module.exports = new AdminUserConsentController();
