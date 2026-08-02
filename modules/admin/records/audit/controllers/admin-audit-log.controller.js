const AdminAuditLogService = require('../services/admin-audit-log.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class AdminAuditLogController {
  list = asyncHandler(async (req, res) => {
    const result = await AdminAuditLogService.list(req.query, req.user.userId);
    return ApiResponse.success(res, 'Logs de auditoría obtenidos exitosamente', result);
  });

  getById = asyncHandler(async (req, res) => {
    const data = await AdminAuditLogService.getById(req.params.auditLogId, req.user.userId);
    return ApiResponse.success(res, 'Log de auditoría obtenido exitosamente', data);
  });

  exportLogs = asyncHandler(async (req, res) => {
    const format = req.query.format ?? 'csv';
    await AdminAuditLogService.exportToResponse(res, req.query, req.user.userId, format);
  });
}

module.exports = new AdminAuditLogController();
