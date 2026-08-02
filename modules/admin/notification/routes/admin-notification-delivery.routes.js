const express = require('express');

const router = express.Router();
const AdminNotificationDeliveryController = require('../controllers/admin-notification-delivery.controller');
const AdminNotificationDeliveryValidator = require('../validators/admin-notification-delivery.validator');
const AuthMiddleware = require('../../../../shared/middlewares/auth.middleware');
const RbacMiddleware = require('../../../../shared/middlewares/rbac.middleware');
const RateLimitMiddleware = require('../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../shared/middlewares/request-lock.middleware');
const BaseValidator = require('../../../../shared/validators/base.validator');
const ValidatorUtil = require('../../../../shared/utils/validators.util');
const AuditAction = require('../../../../shared/middlewares/audit-action.middleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('../../../../shared/constants');

// GET /api/notification-delivery
router.get(
  '/notification-delivery',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_RESEND, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  AdminNotificationDeliveryValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('NOTIFICATION_DELIVERY_LIST_VIEWED', { entityType: 'Notification', entityTable: 'notifications' }),
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
  AuditAction.declare('NOTIFICATION_DELIVERY_METRICS_VIEWED', {
    entityType: 'Notification',
    entityTable: 'notifications'
  }),
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
  AuditAction.declare('NOTIFICATION_DELIVERY_VIEWED', { entityType: 'Notification', entityTable: 'notifications' }),
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
  AuditAction.declare('NOTIFICATION_DELIVERY_RETRY_REQUESTED', { entityType: 'Notification', entityTable: 'notifications' }),
  AdminNotificationDeliveryController.retry
);

module.exports = router;
