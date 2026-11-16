import PromotionalBannerPublicService = require('../services/promotional-banner.service');
import ApiResponse = require('../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;

class PromotionalBannerPublicController {
  /** GET /promotional-banners — público (landing + app cliente) */
  list = asyncHandler(async (req, res) => {
    const result = await PromotionalBannerPublicService.getActiveBanners();
    return ApiResponse.success(res, 'Banners promocionales obtenidos exitosamente', result);
  });
}

export = new PromotionalBannerPublicController();
