const express = require('express');
const router = express.Router();
const PromotionalBannerController = require('../controllers/promotional-banner.controller');
const PromotionalBannerValidator = require('../validators/promotional-banner.validator');
const AuthMiddleware = require('../../../../shared/middlewares/auth.middleware');
const RbacMiddleware = require('../../../../shared/middlewares/rbac.middleware');
const RateLimitMiddleware = require('../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../shared/middlewares/request-lock.middleware');
const UploadMiddleware = require('../../../../shared/middlewares/upload.middleware');
const AuditAction = require('../../../../shared/middlewares/audit-action.middleware');
const ValidatorUtil = require('../../../../shared/utils/validators.util');
const { RBAC_MODULES, RBAC_ACTIONS } = require('../../../../shared/constants/rbac');

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

module.exports = router;
