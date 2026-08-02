const express = require('express');
const router = express.Router();
const NotificationCategoryController = require('../controllers/admin-notification-category.controller');
const NotificationCategoryValidator = require('../validators/admin-notification-category.validator');
const BaseValidator = require('../../../../shared/validators/base.validator');
const AuthMiddleware = require('../../../../shared/middlewares/auth.middleware');
const RateLimitMiddleware = require('../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../shared/middlewares/request-lock.middleware');
const RbacMiddleware = require('../../../../shared/middlewares/rbac.middleware');
const ValidatorUtil = require('../../../../shared/utils/validators.util');
const AuditAction = require('../../../../shared/middlewares/audit-action.middleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('../../../../shared/constants/rbac');

const AUDIT_META = { entityType: 'NotificationCategory', entityTable: 'notification_categories' };

/** GET /admin/api/v1/notification/notification-categories */
router.get(
  '/notification-categories',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_MANAGEMENT, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  NotificationCategoryValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('NOTIFICATION_CATEGORY_LIST_VIEWED', AUDIT_META),
  NotificationCategoryController.list
);

/** GET /admin/api/v1/notification/notification-categories/:notificationCategoryId */
router.get(
  '/notification-categories/:notificationCategoryId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_MANAGEMENT, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('notificationCategoryId', 'La categoría de notificación'),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('NOTIFICATION_CATEGORY_VIEWED', AUDIT_META),
  NotificationCategoryController.getById
);

/** POST /admin/api/v1/notification/notification-categories */
router.post(
  '/notification-categories',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_MANAGEMENT, RBAC_ACTIONS.CREATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  NotificationCategoryValidator.create(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('NOTIFICATION_CATEGORY_CREATED', AUDIT_META),
  NotificationCategoryController.create
);

/** PATCH /admin/api/v1/notification/notification-categories/:notificationCategoryId */
router.patch(
  '/notification-categories/:notificationCategoryId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_MANAGEMENT, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  NotificationCategoryValidator.update(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('NOTIFICATION_CATEGORY_UPDATED', AUDIT_META),
  NotificationCategoryController.update
);

/** DELETE /admin/api/v1/notification/notification-categories/:notificationCategoryId */
router.delete(
  '/notification-categories/:notificationCategoryId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_MANAGEMENT, RBAC_ACTIONS.DELETE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('notificationCategoryId', 'La categoría de notificación'),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('NOTIFICATION_CATEGORY_DELETED', AUDIT_META),
  NotificationCategoryController.remove
);

module.exports = router;
