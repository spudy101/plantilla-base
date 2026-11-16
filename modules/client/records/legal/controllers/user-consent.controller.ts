import type { Request, Response } from 'express';
import UserConsentService = require('../services/user-consent.service');
import ApiResponse = require('../../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;
import routeParamUtilModule = require('../../../../../shared/utils/route-param.util');
const { routeParam } = routeParamUtilModule;
import authUserUtilModule = require('../../../../../shared/utils/auth-user.util');
const { requireAuthUser } = authUserUtilModule;

class UserConsentController {
  getMyConsents = asyncHandler(async (req, res) => {
    const data = await UserConsentService.getMyConsents(requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Consentimientos obtenidos exitosamente', data);
  });

  grant = asyncHandler(async (req, res) => {
    const data = await UserConsentService.grant(req.body, requireAuthUser(req).userId, _clientCtx(req, res));
    return ApiResponse.success(res, 'Consentimientos registrados exitosamente', data, 201);
  });

  revokeMarketing = asyncHandler(async (req, res) => {
    const data = await UserConsentService.revokeMarketing(requireAuthUser(req).userId, routeParam(req, 'consentTypeId'), {
      ..._clientCtx(req, res),
      reason: req.body.reason
    });
    return ApiResponse.success(res, data.message, null);
  });
}

function _clientCtx(req: Request, res: Response) {
  return {
    ip: res.locals.auditContext?.ip,
    userAgent: res.locals.auditContext?.userAgent
  };
}

export = new UserConsentController();
