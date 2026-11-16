import express = require('express');
const router = express.Router();
import NotificationPreferenceController = require('../controllers/notification-preference.controller');
import NotificationPreferenceValidator = require('../validators/notification-preference.validator');
import AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
import RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
import RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
import ValidatorUtil = require('../../../../../shared/utils/validators.util');
import AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');

/**
 * TODAS LAS RUTAS REQUIEREN AUTENTICACIÓN
 */

const AUDIT_META = { entityType: 'UserNotificationPreference', entityTable: 'user_notification_preferences' };

/** GET /person/notifications/preferences — preferencias crudas del usuario (global + overrides) */
router.get(
  '/person/notifications/preferences',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuditAction.declare('NOTIFICATION_PREFERENCES_VIEWED', AUDIT_META),
  NotificationPreferenceController.getPreferences
);

/** GET /person/notifications/preferences/categories — categorías activas + preferencia efectiva */
router.get(
  '/person/notifications/preferences/categories',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuditAction.declare('NOTIFICATION_PREFERENCES_VIEWED', AUDIT_META),
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
  AuditAction.declare('NOTIFICATION_GLOBAL_PREFERENCE_UPDATED', AUDIT_META),
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
  AuditAction.declare('NOTIFICATION_CATEGORY_PREFERENCE_UPDATED', AUDIT_META),
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
  AuditAction.declare('NOTIFICATION_CATEGORY_PREFERENCE_DELETED', AUDIT_META),
  NotificationPreferenceController.deleteCategoryPreference
);

export = router;
