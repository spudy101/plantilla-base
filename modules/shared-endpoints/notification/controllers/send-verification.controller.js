const SendVerificationService = require('../services/send-verification.service');
const ApiResponse = require('../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../shared/middlewares/error.middleware');

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

module.exports = new SendVerificationController();
