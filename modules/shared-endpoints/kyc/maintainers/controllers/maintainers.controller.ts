import MaintainersService from '../services/maintainers.service';
import ApiResponse from '../../../../../shared/utils/app-response.util';
import errorMiddlewareModule from '../../../../../shared/middlewares/error.middleware';
const { asyncHandler } = errorMiddlewareModule;

class MaintainersController {
  listGenders = asyncHandler(async (req, res) => {
    return ApiResponse.success(res, 'Géneros obtenidos exitosamente', await MaintainersService.listGenders(req.query));
  });

  listDocumentTypes = asyncHandler(async (req, res) => {
    return ApiResponse.success(
      res,
      'Tipos de documento obtenidos exitosamente',
      await MaintainersService.listDocumentTypes(req.query)
    );
  });

  listPhonePrefixes = asyncHandler(async (req, res) => {
    return ApiResponse.success(
      res,
      'Prefijos telefónicos obtenidos exitosamente',
      await MaintainersService.listPhonePrefixes(req.query)
    );
  });
  listAvatars = asyncHandler(async (req, res) => {
    return ApiResponse.success(res, 'Avatares obtenidos exitosamente', await MaintainersService.listAvatars(req.query));
  });
  listAvatarThemes = asyncHandler(async (req, res) => {
    return ApiResponse.success(
      res,
      'Temas de avatares obtenidos exitosamente',
      await MaintainersService.listAvatarThemes(req.query)
    );
  });
  listCountries = asyncHandler(async (req, res) => {
    return ApiResponse.success(res, 'Países obtenidos exitosamente', await MaintainersService.listCountries(req.query));
  });
  listDepartments = asyncHandler(async (req, res) => {
    return ApiResponse.success(res, 'Departamentos obtenidos exitosamente', await MaintainersService.listDepartments(req.query));
  });
  listCities = asyncHandler(async (req, res) => {
    return ApiResponse.success(res, 'Ciudades obtenidas exitosamente', await MaintainersService.listCities(req.query));
  });
  listNotificationTypes = asyncHandler(async (req, res) => {
    return ApiResponse.success(
      res,
      'Tipos de notificación obtenidos exitosamente',
      await MaintainersService.listNotificationTypes(req.query)
    );
  });
  listRoles = asyncHandler(async (req, res) => {
    return ApiResponse.success(res, 'Roles obtenidos exitosamente', await MaintainersService.listRoles(req.query));
  });
  getActivePrivacyPolicy = asyncHandler(async (req, res) => {
    return ApiResponse.success(
      res,
      'Política de privacidad activa obtenida exitosamente',
      await MaintainersService.getActivePrivacyPolicy()
    );
  });
}

export default new MaintainersController();
