import express = require('express');
const router = express.Router();
import PromotionalBannerPublicController = require('../controllers/promotional-banner.controller');
import PromotionalBannerPublicValidator = require('../validators/promotional-banner.validator');
import RateLimitMiddleware = require('../../../../shared/middlewares/rate-limit.middleware');
import ValidatorUtil = require('../../../../shared/utils/validators.util');
import AuditAction = require('../../../../shared/middlewares/audit-action.middleware');

// Público (sin authenticate, patrón del formulario de contacto): la landing y la app cliente
// consumen el mismo endpoint. publicLimiter = límite estricto anti-abuso para rutas sin sesión.
router.get(
  '/promotional-banners',
  RateLimitMiddleware.publicLimiter(),
  PromotionalBannerPublicValidator.list(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PROMOTIONAL_BANNERS_PUBLIC_VIEWED', {
    entityType: 'SystemGlobalConfig',
    entityTable: 'system_global_config'
  }),
  PromotionalBannerPublicController.list
);

export = router;
