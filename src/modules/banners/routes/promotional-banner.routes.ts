import express from 'express';
const router = express.Router();
import PromotionalBannerPublicController from '../controllers/promotional-banner.controller';
import PromotionalBannerPublicValidator from '../validators/promotional-banner.validator';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import AuditAction from '../../audit/middlewares/audit-action.middleware';

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

export default router;
