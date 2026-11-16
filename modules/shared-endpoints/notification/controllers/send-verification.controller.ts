import SendVerificationService = require('../services/send-verification.service');
import ApiResponse = require('../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;

class SendVerificationController {
  /** POST /verification/send-verification */
  sendVerification = asyncHandler(async (req, res) => {
    const result = await SendVerificationService.sendVerificationCode(req.body);
    return ApiResponse.success(res, 'Código de verificación enviado', result);
  });

  /** POST /verification/verify-code */
  verifyCode = asyncHandler(async (req, res) => {
    const result = await SendVerificationService.verifyCode(req.body);
    return ApiResponse.success(res, 'Código verificado exitosamente', result);
  });
}

export = new SendVerificationController();
