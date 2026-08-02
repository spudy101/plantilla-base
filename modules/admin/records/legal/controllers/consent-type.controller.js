const ConsentTypeService = require('../services/consent-type.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class ConsentTypeController {
  list = asyncHandler(async (req, res) => {
    const result = await ConsentTypeService.list(req.query, req.user.userId);
    return ApiResponse.success(res, 'Tipos de consentimiento obtenidos exitosamente', result);
  });

  getById = asyncHandler(async (req, res) => {
    const data = await ConsentTypeService.getById(req.params.consentTypeId, req.user.userId);
    return ApiResponse.success(res, 'Tipo de consentimiento obtenido exitosamente', data);
  });

  create = asyncHandler(async (req, res) => {
    const data = await ConsentTypeService.create(req.body, _auditCtx(req, res));
    return ApiResponse.success(res, 'Tipo de consentimiento creado exitosamente', data, 201);
  });

  update = asyncHandler(async (req, res) => {
    const data = await ConsentTypeService.update(req.params.consentTypeId, req.body, _auditCtx(req, res));
    return ApiResponse.success(res, 'Tipo de consentimiento actualizado exitosamente', data);
  });
}

function _auditCtx(req, res) {
  return {
    adminUserId: req.user.userId,
    adminFirstName: req.user.firstName,
    ipAddress: res.locals.auditContext?.ip,
    userAgent: res.locals.auditContext?.userAgent
  };
}

module.exports = new ConsentTypeController();
