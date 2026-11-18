import express from 'express';
import { validate } from '../../../shared/validation/validate';
import { DeliveryListQuery, DeliveryMetricsQuery, DeliveryIdParams } from '../requests/notification.request';

const router = express.Router();
import AdminNotificationDeliveryController from '../controllers/admin-notification-delivery.controller';
import iamModule from '../../iam';
const { AuthMiddleware, RbacMiddleware } = iamModule;
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import constantsModule from '../../../shared/constants';
const { RBAC_MODULES, RBAC_ACTIONS } = constantsModule;

// GET /api/notification-delivery
router.get(
  '/notification-delivery',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_RESEND, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  validate({ query: DeliveryListQuery }),
  AdminNotificationDeliveryController.list
);

// GET /api/notification-delivery/metrics — agregados de éxito/fallo por canal y categoría.
// Debe declararse ANTES de /notification-delivery/:id para que 'metrics' no matchee el param :id.
router.get(
  '/notification-delivery/metrics',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_RESEND, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  validate({ query: DeliveryMetricsQuery }),
  AdminNotificationDeliveryController.metrics
);

// GET /api/notification-delivery/:id
router.get(
  '/notification-delivery/:id',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_RESEND, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  validate({ params: DeliveryIdParams }),
  AdminNotificationDeliveryController.getById
);

// POST /api/notification-delivery/:id/retry?channel=email|push|all
router.post(
  '/notification-delivery/:id/retry',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_RESEND, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  validate({ params: DeliveryIdParams }),
  AdminNotificationDeliveryController.retry
);

export default router;
