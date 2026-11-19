import express from 'express';
import { validate } from '../../../shared/validation/validate';
import { UpdatePreferenceBody, CategoryCodeParams } from '../requests/notification.request';
const router = express.Router();
import NotificationPreferenceController from '../controllers/notification-preference.controller';
import iamModule from '../../iam';
const { AuthMiddleware } = iamModule;
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';

/**
 * TODAS LAS RUTAS REQUIEREN AUTENTICACIÓN
 */


/** GET /person/notifications/preferences — preferencias crudas del usuario (global + overrides) */
router.get(
  '/person/notifications/preferences',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  NotificationPreferenceController.getPreferences
);

/** GET /person/notifications/preferences/categories — categorías activas + preferencia efectiva */
router.get(
  '/person/notifications/preferences/categories',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  NotificationPreferenceController.getCategoriesWithPreferences
);

/** PUT /person/notifications/preferences/global */
router.put(
  '/person/notifications/preferences/global',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  validate({ body: UpdatePreferenceBody }),
  NotificationPreferenceController.updateGlobalPreference
);

/** PUT /person/notifications/preferences/category/:categoryCode */
router.put(
  '/person/notifications/preferences/category/:categoryCode',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  validate({ params: CategoryCodeParams, body: UpdatePreferenceBody }),
  NotificationPreferenceController.updateCategoryPreference
);

/** DELETE /person/notifications/preferences/category/:categoryCode */
router.delete(
  '/person/notifications/preferences/category/:categoryCode',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  validate({ params: CategoryCodeParams }),
  NotificationPreferenceController.deleteCategoryPreference
);

export default router;
