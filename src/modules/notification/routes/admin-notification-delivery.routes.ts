import express from 'express';

const router = express.Router();
import AdminNotificationDeliveryController from '../controllers/admin-notification-delivery.controller';
import AdminNotificationDeliveryValidator from '../validators/admin-notification-delivery.validator';
import AuthMiddleware from '../../iam/middlewares/auth.middleware';
import RbacMiddleware from '../../iam/middlewares/rbac.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import BaseValidator from '../../../shared/http/base.validator';
import ValidatorUtil from '../../../shared/http/validators.util';
import constantsModule from '../../../shared/constants';
const { RBAC_MODULES, RBAC_ACTIONS } = constantsModule;

// GET /api/notification-delivery
router.get(
  '/notification-delivery',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_RESEND, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  AdminNotificationDeliveryValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  AdminNotificationDeliveryController.list
);

// GET /api/notification-delivery/metrics — agregados de éxito/fallo por canal y categoría.
// Debe declararse ANTES de /notification-delivery/:id para que 'metrics' no matchee el param :id.
router.get(
  '/notification-delivery/metrics',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_RESEND, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  AdminNotificationDeliveryValidator.metricsQuery(),
  ValidatorUtil.handleValidationErrors,
  AdminNotificationDeliveryController.metrics
);

// GET /api/notification-delivery/:id
router.get(
  '/notification-delivery/:id',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_RESEND, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  ...BaseValidator.uuidParam('id', 'La notificación'),
  ValidatorUtil.handleValidationErrors,
  AdminNotificationDeliveryController.getById
);

// POST /api/notification-delivery/:id/retry?channel=email|push|all
router.post(
  '/notification-delivery/:id/retry',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_RESEND, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ...BaseValidator.uuidParam('id', 'La notificación'),
  ValidatorUtil.handleValidationErrors,
  AdminNotificationDeliveryController.retry
);

export default router;
