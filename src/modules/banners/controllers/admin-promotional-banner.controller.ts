import PromotionalBannerService from '../services/admin-promotional-banner.service';
import ApiResponse from '../../../shared/http/app-response.util';
import errorMiddlewareModule from '../../../shared/http/error.middleware';
const { asyncHandler } = errorMiddlewareModule;
import authUserUtilModule from '../../../shared/http/auth-user.util';
const { requireAuthUser } = authUserUtilModule;

class PromotionalBannerController {
  /** GET /promotional-banners */
  list = asyncHandler(async (req, res) => {
    const result = await PromotionalBannerService.list(requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Banners promocionales obtenidos exitosamente', result);
  });

  /** PUT /promotional-banners — reemplaza el catálogo completo */
  replace = asyncHandler(async (req, res) => {
    const result = await PromotionalBannerService.replace(req.body.banners, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Banners promocionales actualizados exitosamente', result);
  });

  /** POST /promotional-banners/image — multipart, campo "image" */
  uploadImage = asyncHandler(async (req, res) => {
    // uploadFields([{ name: 'image' }]) → req.files es un mapa campo → archivos
    const files = req.files as Record<string, Express.Multer.File[] | undefined> | undefined;
    const file = files?.image?.[0] ?? null;
    const result = await PromotionalBannerService.uploadImage(file, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Imagen del banner subida exitosamente', result, 201);
  });
}

export default new PromotionalBannerController();
