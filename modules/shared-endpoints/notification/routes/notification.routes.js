const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/notification.controller');
const NotificationValidator = require('../validators/notification.validator');
const AuthMiddleware = require('../../../../shared/middlewares/auth.middleware');
const RateLimitMiddleware = require('../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../shared/middlewares/request-lock.middleware');
const ValidatorUtil = require('../../../../shared/utils/validators.util');
const AuditAction = require('../../../../shared/middlewares/audit-action.middleware');

/**
 * GET /count/stream debe ir ANTES de GET /count para que Express no lo confunda.
 */

/** GET /count/stream — SSE: stream de conteo en tiempo real */
router.get(
  '/count/stream',
  AuthMiddleware.authenticate,
  AuditAction.declare('NOTIFICATION_UNREAD_COUNT_VIEWED', { entityType: 'Notification', entityTable: 'notifications' }),
  NotificationController.streamUnreadCount
);

/** GET /count — conteo puntual de no leídas */
router.get(
  '/count',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  AuditAction.declare('NOTIFICATION_UNREAD_COUNT_VIEWED', { entityType: 'Notification', entityTable: 'notifications' }),
  NotificationController.getUnreadCount
);

/** POST / — creación externa vía X-API-Key */
router.post(
  '/notifications',
  AuthMiddleware.externalAuthenticate,
  AuditAction.declare('NOTIFICATION_CREATED', { entityType: 'Notification', entityTable: 'notifications' }),
  NotificationController.createNotification
);

/** GET / — listado mixto (personal + global) paginado */
router.get(
  '/notifications',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  NotificationValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('NOTIFICATION_LIST_VIEWED', { entityType: 'Notification', entityTable: 'notifications' }),
  NotificationController.getNotificationsList
);

/** GET /personal — solo notificaciones personales */
router.get(
  '/notifications/personal',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  NotificationValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('NOTIFICATION_PERSONAL_LIST_VIEWED', { entityType: 'Notification', entityTable: 'notifications' }),
  NotificationController.getPersonalNotifications
);

/** GET /global — solo notificaciones globales */
router.get(
  '/notifications/global',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  NotificationValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('NOTIFICATION_GLOBAL_LIST_VIEWED', {
    entityType: 'GlobalNotification',
    entityTable: 'global_notifications'
  }),
  NotificationController.getGlobalNotifications
);

module.exports = router;
