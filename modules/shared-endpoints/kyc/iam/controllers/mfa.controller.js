const MFAService = require('../services/mfa.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class MFAController {
  /** POST /mfa/setup-totp */
  setupTOTP = asyncHandler(async (req, res) => {
    const result = await MFAService.setupTOTP(req.user.userId, req.user.username);
    return ApiResponse.success(res, 'TOTP configurado correctamente', result);
  });

  /** POST /mfa/activate-totp */
  activateTOTP = asyncHandler(async (req, res) => {
    const result = await MFAService.verifyAndActivateTOTP(
      req.body.totpCode,
      req.user.userId,
      req.user.username,
      req.user.firstName,
      res.locals.auditContext
    );
    return ApiResponse.success(res, 'TOTP activado correctamente', result);
  });

  /** POST /mfa/verify-totp */
  verifyTOTP = asyncHandler(async (req, res) => {
    const result = await MFAService.verifyTOTP(req.body.totpCode, req.user.userId, req.user.username);
    return ApiResponse.success(res, 'Código TOTP válido', result);
  });

  /** POST /mfa/deactivate-totp */
  deactivateTOTP = asyncHandler(async (req, res) => {
    const result = await MFAService.deactivateTOTP(
      req.body.password,
      req.user.userId,
      req.user.username,
      req.user.firstName,
      res.locals.auditContext
    );
    return ApiResponse.success(res, 'TOTP desactivado correctamente', result);
  });

  /** POST /mfa/validate-password */
  validatePassword = asyncHandler(async (req, res) => {
    const result = await MFAService.validatePassword(req.body.password, req.user.userId, req.user.username);
    const message = result.valid ? 'Contraseña correcta' : 'Contraseña inválida';
    return ApiResponse.success(res, message, result);
  });

  /** GET /mfa/status */
  getStatus = asyncHandler(async (req, res) => {
    const result = await MFAService.getStatus(req.user.userId, req.user.username);
    return ApiResponse.success(res, 'Estado MFA obtenido correctamente', result);
  });

  /** POST /mfa/sms/request */
  requestSMSActivation = asyncHandler(async (req, res) => {
    const result = await MFAService.requestSMSActivation(req.body.password, req.user.userId, req.user.username);
    return ApiResponse.success(res, 'Código de verificación enviado', result);
  });

  /** POST /mfa/sms/confirm */
  confirmSMSActivation = asyncHandler(async (req, res) => {
    const result = await MFAService.confirmSMSActivation(
      req.body.code,
      req.user.userId,
      req.user.username,
      req.user.firstName,
      res.locals.auditContext
    );
    return ApiResponse.success(res, 'SMS MFA activado correctamente', result);
  });

  /** POST /mfa/deactivate-sms */
  deactivateSMS = asyncHandler(async (req, res) => {
    const result = await MFAService.deactivateSMSMFA(
      req.body.password,
      req.user.userId,
      req.user.username,
      req.user.firstName,
      res.locals.auditContext
    );
    return ApiResponse.success(res, 'SMS MFA desactivado correctamente', result);
  });

  /** PUT /mfa/preferred-method */
  updatePreferredMethod = asyncHandler(async (req, res) => {
    const result = await MFAService.updatePreferredMethod(
      req.body.preferredMethod,
      req.user.userId,
      req.user.username,
      res.locals.auditContext
    );
    return ApiResponse.success(res, 'Método MFA preferido actualizado correctamente', result);
  });
}

module.exports = new MFAController();
