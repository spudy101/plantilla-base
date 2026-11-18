import express from 'express';
import { validate } from '../../../shared/validation/validate';
import { NotificationListQuery } from '../requests/notification.request';
const router = express.Router();
import NotificationController from '../controllers/notification.controller';
import iamModule from '../../iam';
const { AuthMiddleware } = iamModule;
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';

/**
 * GET /count/stream debe ir ANTES de GET /count para que Express no lo confunda.
 */

/** GET /count/stream — SSE: stream de conteo en tiempo real */
router.get(
  '/count/stream',
  AuthMiddleware.authenticate,
  NotificationController.streamUnreadCount
);

/** GET /count — conteo puntual de no leídas */
router.get(
  '/count',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  NotificationController.getUnreadCount
);

/** POST / — creación externa vía X-API-Key */
router.post(
  '/notifications',
  AuthMiddleware.externalAuthenticate,
  NotificationController.createNotification
);

/** GET / — listado mixto (personal + global) paginado */
router.get(
  '/notifications',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  validate({ query: NotificationListQuery }),
  NotificationController.getNotificationsList
);

/** GET /personal — solo notificaciones personales */
router.get(
  '/notifications/personal',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  validate({ query: NotificationListQuery }),
  NotificationController.getPersonalNotifications
);

/** GET /global — solo notificaciones globales */
router.get(
  '/notifications/global',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  validate({ query: NotificationListQuery }),
  NotificationController.getGlobalNotifications
);

export default router;
