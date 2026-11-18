import express from 'express';
const router = express.Router();
import MaintainersController from '../controllers/maintainers.controller';
import MaintainersValidator from '../validators/maintainers.validator';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';

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
  MaintainersController.listGenders
);

router.get(
  '/maintainers/document-types',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  MaintainersController.listDocumentTypes
);

router.get(
  '/maintainers/phone-prefixes',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  MaintainersController.listPhonePrefixes
);

router.get(
  '/maintainers/countries',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  MaintainersController.listCountries
);

router.get(
  '/maintainers/departments',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  MaintainersController.listDepartments
);

router.get(
  '/maintainers/cities',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  MaintainersController.listCities
);

router.get(
  '/maintainers/avatars',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  MaintainersController.listAvatars
);

router.get(
  '/maintainers/avatar-themes',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  MaintainersController.listAvatarThemes
);

router.get(
  '/maintainers/notification-types',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
  MaintainersController.listNotificationTypes
);

router.get(
  '/maintainers/roles',
  RateLimitMiddleware.publicLimiter(),
  RequestLockMiddleware.forPublicEndpoints(),
  MaintainersValidator.paginationQuery(),
  ValidatorUtil.handleValidationErrors,
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
  MaintainersController.getActivePrivacyPolicy
);

export default router;
