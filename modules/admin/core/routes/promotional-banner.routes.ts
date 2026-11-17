import express from 'express';
const router = express.Router();
import PromotionalBannerController from '../controllers/promotional-banner.controller';
import PromotionalBannerValidator from '../validators/promotional-banner.validator';
import AuthMiddleware from '../../../../shared/middlewares/auth.middleware';
import RbacMiddleware from '../../../../shared/middlewares/rbac.middleware';
import RateLimitMiddleware from '../../../../shared/middlewares/rate-limit.middleware';
import RequestLockMiddleware from '../../../../shared/middlewares/request-lock.middleware';
import UploadMiddleware from '../../../../shared/middlewares/upload.middleware';
import AuditAction from '../../../../shared/middlewares/audit-action.middleware';
import ValidatorUtil from '../../../../shared/utils/validators.util';
import rbacModule from '../../../../shared/constants/rbac';
const { RBAC_MODULES, RBAC_ACTIONS } = rbacModule;

const ENTITY = { entityType: 'SystemGlobalConfig', entityTable: 'system_global_config' };

// Mantenedor admin de banners promocionales (landing pública + app cliente).
router.get(
  '/promotional-banners',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.PROMOTIONAL_CONTENT, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuditAction.declare('PROMOTIONAL_BANNERS_VIEWED_ADMIN', ENTITY),
  PromotionalBannerController.list
);

router.put(
  '/promotional-banners',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.PROMOTIONAL_CONTENT, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  PromotionalBannerValidator.replace(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PROMOTIONAL_BANNERS_UPDATED', ENTITY),
  PromotionalBannerController.replace
);

router.post(
  '/promotional-banners/image',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.PROMOTIONAL_CONTENT, RBAC_ACTIONS.CREATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  UploadMiddleware.uploadFields([{ name: 'image', maxCount: 1 }], { maxFileSize: UploadMiddleware.MAX_IMAGE_SIZE }),
  UploadMiddleware.handleMulterError,
  PromotionalBannerValidator.uploadImage(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PROMOTIONAL_BANNER_IMAGE_UPLOADED', ENTITY),
  PromotionalBannerController.uploadImage
);

export default router;
