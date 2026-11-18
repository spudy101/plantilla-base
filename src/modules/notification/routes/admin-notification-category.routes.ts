import express from 'express';
const router = express.Router();
import NotificationCategoryController from '../controllers/admin-notification-category.controller';
import NotificationCategoryValidator from '../validators/admin-notification-category.validator';
import BaseValidator from '../../../shared/http/base.validator';
import AuthMiddleware from '../../iam/middlewares/auth.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import RbacMiddleware from '../../iam/middlewares/rbac.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import rbacModule from '../../../shared/constants/rbac';
const { RBAC_MODULES, RBAC_ACTIONS } = rbacModule;


/** GET /admin/api/v1/notification/notification-categories */
router.get(
  '/notification-categories',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_MANAGEMENT, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  NotificationCategoryValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
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
  NotificationCategoryController.remove
);

export default router;
