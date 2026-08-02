const express = require('express');
const router = express.Router();
const MaintainersController = require('../controllers/maintainers.controller');
const MaintainersValidator = require('../validators/maintainers.validator');
const RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
const ValidatorUtil = require('../../../../../shared/utils/validators.util');
const AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');

/**
 * TODAS LAS RUTAS SON PÚBLICAS — no requieren autenticación
 */

// === RF-LP-01: Landing Page & UX Pública — Endpoints públicos sin autenticación ===

router.get(
  '/maintainers/genders',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('MAINTAINER_GENDERS_VIEWED', { entityType: 'Catalog' }),
  MaintainersController.listGenders
);

router.get(
  '/maintainers/document-types',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('MAINTAINER_DOCUMENT_TYPES_VIEWED', { entityType: 'Catalog' }),
  MaintainersController.listDocumentTypes
);

router.get(
  '/maintainers/phone-prefixes',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('MAINTAINER_PHONE_PREFIXES_VIEWED', { entityType: 'Catalog' }),
  MaintainersController.listPhonePrefixes
);

router.get(
  '/maintainers/countries',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('MAINTAINER_COUNTRIES_VIEWED', { entityType: 'Catalog' }),
  MaintainersController.listCountries
);

router.get(
  '/maintainers/departments',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('MAINTAINER_DEPARTMENTS_VIEWED', { entityType: 'Catalog' }),
  MaintainersController.listDepartments
);

router.get(
  '/maintainers/cities',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('MAINTAINER_CITIES_VIEWED', { entityType: 'Catalog' }),
  MaintainersController.listCities
);

router.get(
  '/maintainers/avatars',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('MAINTAINER_AVATARS_VIEWED', { entityType: 'Catalog' }),
  MaintainersController.listAvatars
);

router.get(
  '/maintainers/avatar-themes',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('MAINTAINER_AVATAR_THEMES_VIEWED', { entityType: 'Catalog' }),
  MaintainersController.listAvatarThemes
);

router.get(
  '/maintainers/notification-types',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('MAINTAINER_NOTIFICATION_TYPES_VIEWED', { entityType: 'Catalog' }),
  MaintainersController.listNotificationTypes
);

router.get(
  '/maintainers/roles',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('MAINTAINER_ROLES_VIEWED', { entityType: 'Catalog' }),
  MaintainersController.listRoles
);

/**
 * GET /api/maintainers/privacy-policy/active
 * Retorna la versión activa de la política de privacidad.
 * Ruta pública — el front la llama antes del registro para mostrar el PDF.
 */
router.get(
  '/maintainers/privacy-policy/active',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  AuditAction.declare('PRIVACY_POLICY_VIEWED', { entityType: 'Catalog' }),
  MaintainersController.getActivePrivacyPolicy
);

module.exports = router;
