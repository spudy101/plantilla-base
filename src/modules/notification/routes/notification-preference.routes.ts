import express from 'express';
const router = express.Router();
import NotificationPreferenceController from '../controllers/notification-preference.controller';
import NotificationPreferenceValidator from '../validators/notification-preference.validator';
import AuthMiddleware from '../../iam/middlewares/auth.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';

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
  NotificationPreferenceValidator.updateGlobalPreference(),
  ValidatorUtil.handleValidationErrors,
  NotificationPreferenceController.updateGlobalPreference
);

/** PUT /person/notifications/preferences/category/:categoryCode */
router.put(
  '/person/notifications/preferences/category/:categoryCode',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  NotificationPreferenceValidator.updateCategoryPreference(),
  ValidatorUtil.handleValidationErrors,
  NotificationPreferenceController.updateCategoryPreference
);

/** DELETE /person/notifications/preferences/category/:categoryCode */
router.delete(
  '/person/notifications/preferences/category/:categoryCode',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  NotificationPreferenceValidator.deleteCategoryPreference(),
  ValidatorUtil.handleValidationErrors,
  NotificationPreferenceController.deleteCategoryPreference
);

export default router;
