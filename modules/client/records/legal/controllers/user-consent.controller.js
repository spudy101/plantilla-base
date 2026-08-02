const UserConsentService = require('../services/user-consent.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class UserConsentController {
  getMyConsents = asyncHandler(async (req, res) => {
    const data = await UserConsentService.getMyConsents(req.user.userId);
    return ApiResponse.success(res, 'Consentimientos obtenidos exitosamente', data);
  });

  grant = asyncHandler(async (req, res) => {
    const data = await UserConsentService.grant(req.body, req.user.userId, _clientCtx(req, res));
    return ApiResponse.success(res, 'Consentimientos registrados exitosamente', data, 201);
  });

  revokeMarketing = asyncHandler(async (req, res) => {
    const data = await UserConsentService.revokeMarketing(req.user.userId, req.params.consentTypeId, {
      ..._clientCtx(req, res),
      reason: req.body.reason
    });
    return ApiResponse.success(res, data.message, null);
  });
}

function _clientCtx(req, res) {
  return {
    ip: res.locals.auditContext?.ip,
    userAgent: res.locals.auditContext?.userAgent
  };
}

module.exports = new UserConsentController();
