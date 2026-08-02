const IntegrationMonitoringService = require('../services/integration-monitoring.service');
const ApiResponse = require('../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../shared/middlewares/error.middleware');

class IntegrationMonitoringController {
  dashboard = asyncHandler(async (req, res) => {
    const data = await IntegrationMonitoringService.getDashboard(req.query, req.user.userId);
    return ApiResponse.success(res, 'Dashboard de integraciones obtenido exitosamente', data);
  });

  health = asyncHandler(async (req, res) => {
    const data = await IntegrationMonitoringService.getProvidersHealth(req.user.userId);
    return ApiResponse.success(res, 'Salud de proveedores obtenida exitosamente', data);
  });

  logs = asyncHandler(async (req, res) => {
    const { data, metadata } = await IntegrationMonitoringService.getLogs(req.query, req.user.userId);
    return ApiResponse.success(res, 'Bitácora de llamadas obtenida exitosamente', data, 200, metadata);
  });

  logDetail = asyncHandler(async (req, res) => {
    const data = await IntegrationMonitoringService.getLogDetail(req.params.apiLogId, req.user.userId);
    return ApiResponse.success(res, 'Detalle de llamada obtenido exitosamente', data);
  });

  fallbacks = asyncHandler(async (req, res) => {
    const { data, metadata } = await IntegrationMonitoringService.getFallbackHistory(req.query, req.user.userId);
    return ApiResponse.success(res, 'Historial de fallbacks obtenido exitosamente', data, 200, metadata);
  });
}

module.exports = new IntegrationMonitoringController();
