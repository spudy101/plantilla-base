const express = require('express');
const router = express.Router();
const NotificationPreferenceController = require('../controllers/notification-preference.controller');
const NotificationPreferenceValidator = require('../validators/notification-preference.validator');
const AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
const RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
const ValidatorUtil = require('../../../../../shared/utils/validators.util');
const AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');

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

module.exports = router;
