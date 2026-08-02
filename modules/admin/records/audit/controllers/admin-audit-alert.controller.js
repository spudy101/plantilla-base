const AdminAuditAlertService = require('../services/admin-audit-alert.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class AdminAuditAlertController {
  list = asyncHandler(async (req, res) => {
    const result = await AdminAuditAlertService.list(req.query, req.user.userId);
    return ApiResponse.success(res, 'Alertas de auditoría obtenidas exitosamente', result);
  });

  acknowledge = asyncHandler(async (req, res) => {
    const data = await AdminAuditAlertService.acknowledge(req.params.alertId, req.user.userId);
    return ApiResponse.success(res, 'Alerta reconocida exitosamente', data);
  });

  acknowledgeBulk = asyncHandler(async (req, res) => {
    const data = await AdminAuditAlertService.acknowledgeBulk(req.body.alertIds, req.user.userId);
    return ApiResponse.success(res, `${data.acknowledged} alertas reconocidas exitosamente`, data);
  });
}

module.exports = new AdminAuditAlertController();
