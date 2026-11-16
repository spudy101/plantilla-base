// modules/client/kyc/controllers/person-reference.controller.ts

import PersonReferenceService = require('../services/person-reference.service');
import ApiResponse = require('../../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;
import routeParamUtilModule = require('../../../../../shared/utils/route-param.util');
const { routeParam } = routeParamUtilModule;
import authUserUtilModule = require('../../../../../shared/utils/auth-user.util');
const { requireAuthPerson } = authUserUtilModule;

class PersonReferenceController {
  list = asyncHandler(async (req, res) => {
    const user = requireAuthPerson(req);
    const data = await PersonReferenceService.list(user.personId, user.userId);
    return ApiResponse.success(res, 'Referencias obtenidas exitosamente', data);
  });

  create = asyncHandler(async (req, res) => {
    const user = requireAuthPerson(req);
    const data = await PersonReferenceService.create(req.body, user.personId, user.userId);
    return ApiResponse.success(res, 'Referencia creada exitosamente', data, 201);
  });

  update = asyncHandler(async (req, res) => {
    const user = requireAuthPerson(req);
    const data = await PersonReferenceService.update(routeParam(req, 'referenceId'), req.body, user.personId, user.userId);
    return ApiResponse.success(res, 'Referencia actualizada exitosamente', data);
  });

  remove = asyncHandler(async (req, res) => {
    const user = requireAuthPerson(req);
    await PersonReferenceService.remove(routeParam(req, 'referenceId'), user.personId, user.userId);
    return ApiResponse.success(res, 'Referencia eliminada exitosamente');
  });
}

export = new PersonReferenceController();
