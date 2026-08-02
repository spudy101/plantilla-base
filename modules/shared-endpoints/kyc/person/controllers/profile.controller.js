const ProfileService = require('../services/profile.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class ProfileController {
  /** GET /profile */
  getProfile = asyncHandler(async (req, res) => {
    const result = await ProfileService.getProfile(req.user.userId);
    return ApiResponse.success(res, 'Perfil básico obtenido exitosamente', result);
  });

  /** GET /profile/extended */
  getExtendedProfile = asyncHandler(async (req, res) => {
    const result = await ProfileService.getExtendedProfile(req.user.userId);
    return ApiResponse.success(res, 'Perfil extendido obtenido exitosamente', result);
  });

  /** GET /profile/location */
  getLocation = asyncHandler(async (req, res) => {
    const result = await ProfileService.getLocation(req.user.personId, req.user.userId);
    return ApiResponse.success(res, 'Ubicación obtenida exitosamente', result);
  });

  /** GET /profile/contact */
  getContactInfo = asyncHandler(async (req, res) => {
    const result = await ProfileService.getContactInfo(req.user.personId, req.user.userId);
    return ApiResponse.success(res, 'Información de contacto obtenida exitosamente', result);
  });

  /** PUT /profile */
  updateProfile = asyncHandler(async (req, res) => {
    const result = await ProfileService.updateProfile(
      req.body,
      req.user.userId,
      req.user.personId,
      req.user.username,
      req.user.firstName,
      res.locals.auditContext
    );
    return ApiResponse.success(res, 'Perfil actualizado exitosamente', result);
  });

  /** PUT /profile/email */
  updateEmail = asyncHandler(async (req, res) => {
    const result = await ProfileService.updateEmail(
      req.body,
      req.user.userId,
      req.user.personId,
      req.user.firstName,
      res.locals.auditContext
    );
    return ApiResponse.success(res, 'Email actualizado exitosamente', result);
  });

  /** PUT /profile/phone */
  updatePhone = asyncHandler(async (req, res) => {
    const result = await ProfileService.updatePhone(
      req.body,
      req.user.userId,
      req.user.personId,
      req.user.firstName,
      res.locals.auditContext
    );
    return ApiResponse.success(res, 'Teléfono actualizado exitosamente', result);
  });

  /** PUT /profile/password */
  updatePassword = asyncHandler(async (req, res) => {
    await ProfileService.updatePassword(
      req.body,
      req.user.userId,
      req.user.firstName,
      res.locals.auditContext
    );
    return ApiResponse.success(res, 'Contraseña actualizada exitosamente');
  });

  /** PUT /profile/names */
  updateNames = asyncHandler(async (req, res) => {
    const result = await ProfileService.updateNames(
      req.body,
      req.user.userId,
      req.user.personId,
      req.user.firstName,
      res.locals.auditContext
    );
    return ApiResponse.success(res, 'Nombres actualizados exitosamente', result);
  });

  /** DELETE /profile/delete-account */
  deleteAccount = asyncHandler(async (req, res) => {
    await ProfileService.deleteAccount(req.body, {
      userId: req.user.userId,
      personId: req.user.personId,
      nationalId: req.user.nationalId,
      email: req.user.email,
      firstName: req.user.firstName,
      auditContext: res.locals.auditContext
    });
    return ApiResponse.success(res, 'Cuenta eliminada exitosamente');
  });
}

module.exports = new ProfileController();
