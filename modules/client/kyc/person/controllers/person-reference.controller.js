// modules/client/kyc/controllers/person-reference.controller.js

const PersonReferenceService = require('../services/person-reference.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class PersonReferenceController {
  list = asyncHandler(async (req, res) => {
    const data = await PersonReferenceService.list(req.user.personId, req.user.userId);
    return ApiResponse.success(res, 'Referencias obtenidas exitosamente', data);
  });

  create = asyncHandler(async (req, res) => {
    const data = await PersonReferenceService.create(req.body, req.user.personId, req.user.userId);
    return ApiResponse.success(res, 'Referencia creada exitosamente', data, 201);
  });

  update = asyncHandler(async (req, res) => {
    const data = await PersonReferenceService.update(req.params.referenceId, req.body, req.user.personId, req.user.userId);
    return ApiResponse.success(res, 'Referencia actualizada exitosamente', data);
  });

  remove = asyncHandler(async (req, res) => {
    await PersonReferenceService.remove(req.params.referenceId, req.user.personId, req.user.userId);
    return ApiResponse.success(res, 'Referencia eliminada exitosamente');
  });
}

module.exports = new PersonReferenceController();
