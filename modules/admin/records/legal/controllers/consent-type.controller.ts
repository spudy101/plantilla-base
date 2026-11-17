import ConsentTypeService = require('../services/consent-type.service');
import ApiResponse = require('../../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;
import routeParamUtilModule = require('../../../../../shared/utils/route-param.util');
const { routeParam } = routeParamUtilModule;
import authUserUtilModule = require('../../../../../shared/utils/auth-user.util');
const { requireAuthUser } = authUserUtilModule;
import adminAuditContextUtilModule = require('../../../../../shared/utils/admin-audit-context.util');
const { adminAuditContext } = adminAuditContextUtilModule;

class ConsentTypeController {
  list = asyncHandler(async (req, res) => {
    const result = await ConsentTypeService.list(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Tipos de consentimiento obtenidos exitosamente', result);
  });

  getById = asyncHandler(async (req, res) => {
    const data = await ConsentTypeService.getById(routeParam(req, 'consentTypeId'), requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Tipo de consentimiento obtenido exitosamente', data);
  });

  create = asyncHandler(async (req, res) => {
    const data = await ConsentTypeService.create(req.body, adminAuditContext(req, res));
    return ApiResponse.success(res, 'Tipo de consentimiento creado exitosamente', data, 201);
  });

  update = asyncHandler(async (req, res) => {
    const data = await ConsentTypeService.update(routeParam(req, 'consentTypeId'), req.body, adminAuditContext(req, res));
    return ApiResponse.success(res, 'Tipo de consentimiento actualizado exitosamente', data);
  });
}


export = new ConsentTypeController();
