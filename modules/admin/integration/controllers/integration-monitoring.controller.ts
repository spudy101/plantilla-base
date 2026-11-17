import IntegrationMonitoringService from '../services/integration-monitoring.service';
import ApiResponse from '../../../../shared/utils/app-response.util';
import errorMiddlewareModule from '../../../../shared/middlewares/error.middleware';
const { asyncHandler } = errorMiddlewareModule;
import routeParamUtilModule from '../../../../shared/utils/route-param.util';
const { routeParam } = routeParamUtilModule;
import authUserUtilModule from '../../../../shared/utils/auth-user.util';
const { requireAuthUser } = authUserUtilModule;

class IntegrationMonitoringController {
  dashboard = asyncHandler(async (req, res) => {
    const data = await IntegrationMonitoringService.getDashboard(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Dashboard de integraciones obtenido exitosamente', data);
  });

  health = asyncHandler(async (req, res) => {
    const data = await IntegrationMonitoringService.getProvidersHealth(requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Salud de proveedores obtenida exitosamente', data);
  });

  logs = asyncHandler(async (req, res) => {
    const { data, metadata } = await IntegrationMonitoringService.getLogs(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Bitácora de llamadas obtenida exitosamente', data, 200, metadata);
  });

  logDetail = asyncHandler(async (req, res) => {
    const data = await IntegrationMonitoringService.getLogDetail(routeParam(req, 'apiLogId'), requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Detalle de llamada obtenido exitosamente', data);
  });

  fallbacks = asyncHandler(async (req, res) => {
    const { data, metadata } = await IntegrationMonitoringService.getFallbackHistory(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Historial de fallbacks obtenido exitosamente', data, 200, metadata);
  });
}

export default new IntegrationMonitoringController();
