const PromotionalBannerPublicService = require('../services/promotional-banner.service');
const ApiResponse = require('../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../shared/middlewares/error.middleware');

class PromotionalBannerPublicController {
  /** GET /promotional-banners — público (landing + app cliente) */
  list = asyncHandler(async (req, res) => {
    const result = await PromotionalBannerPublicService.getActiveBanners();
    return ApiResponse.success(res, 'Banners promocionales obtenidos exitosamente', result);
  });
}

module.exports = new PromotionalBannerPublicController();
