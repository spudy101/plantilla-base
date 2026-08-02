const express = require('express');
const router = express.Router();
const PromotionalBannerPublicController = require('../controllers/promotional-banner.controller');
const PromotionalBannerPublicValidator = require('../validators/promotional-banner.validator');
const RateLimitMiddleware = require('../../../../shared/middlewares/rate-limit.middleware');
const ValidatorUtil = require('../../../../shared/utils/validators.util');
const AuditAction = require('../../../../shared/middlewares/audit-action.middleware');

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

module.exports = router;
