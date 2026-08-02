const PromotionalBannerService = require('../services/promotional-banner.service');
const ApiResponse = require('../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../shared/middlewares/error.middleware');

class PromotionalBannerController {
  /** GET /promotional-banners */
  list = asyncHandler(async (req, res) => {
    const result = await PromotionalBannerService.list(req.user.userId);
    return ApiResponse.success(res, 'Banners promocionales obtenidos exitosamente', result);
  });

  /** PUT /promotional-banners — reemplaza el catálogo completo */
  replace = asyncHandler(async (req, res) => {
    const result = await PromotionalBannerService.replace(req.body.banners, req.user.userId);
    return ApiResponse.success(res, 'Banners promocionales actualizados exitosamente', result);
  });

  /** POST /promotional-banners/image — multipart, campo "image" */
  uploadImage = asyncHandler(async (req, res) => {
    const file = req.files?.image?.[0] ?? null;
    const result = await PromotionalBannerService.uploadImage(file, req.user.userId);
    return ApiResponse.success(res, 'Imagen del banner subida exitosamente', result, 201);
  });
}

module.exports = new PromotionalBannerController();
