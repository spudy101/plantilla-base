import express from 'express';
const router = express.Router();
import PromotionalBannerController from '../controllers/admin-promotional-banner.controller';
import PromotionalBannerValidator from '../validators/admin-promotional-banner.validator';
import AuthMiddleware from '../../iam/middlewares/auth.middleware';
import RbacMiddleware from '../../iam/middlewares/rbac.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import UploadMiddleware from '../../../shared/http/upload.middleware';
import AuditAction from '../../audit/middlewares/audit-action.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import rbacModule from '../../../shared/constants/rbac';
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
