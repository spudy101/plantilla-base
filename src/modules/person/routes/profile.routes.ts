import express from 'express';
const router = express.Router();
import ProfileController from '../controllers/profile.controller';
import ProfileValidator from '../validators/profile.validator';
import AuthMiddleware from '../../iam/middlewares/auth.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';

/**
 * TODAS LAS RUTAS REQUIEREN AUTENTICACIÓN
 */

/** GET /profile */
router.get(
  '/person/profile',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ProfileController.getProfile
);

/** GET /person/profile/extended */
router.get(
  '/person/profile/extended',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ProfileController.getExtendedProfile
);

/** GET /person/profile/location */
router.get(
  '/person/profile/location',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ProfileController.getLocation
);

/** GET /person/profile/contact */
router.get(
  '/person/profile/contact',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ProfileController.getContactInfo
);

/** PUT /profile */
router.put(
  '/person/profile',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ProfileValidator.updateProfile(),
  ValidatorUtil.handleValidationErrors,
  ProfileController.updateProfile
);

/** PUT /person/profile/email */
router.put(
  '/person/profile/email',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ProfileValidator.updateEmail(),
  ValidatorUtil.handleValidationErrors,
  ProfileController.updateEmail
);

/** PUT /person/profile/phone */
router.put(
  '/person/profile/phone',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ProfileValidator.updatePhone(),
  ValidatorUtil.handleValidationErrors,
  ProfileController.updatePhone
);

/** PUT /person/profile/password */
router.put(
  '/person/profile/password',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ProfileValidator.updatePassword(),
  ValidatorUtil.handleValidationErrors,
  ProfileController.updatePassword
);

// El documento de identidad (RUT + tipo) es inmutable para el propio usuario: se fija en el registro.
// Su corrección es potestad del admin (PUT /kyc/person/:userId/national-id, con maker-checker).

/** PUT /person/profile/names */
router.put(
  '/person/profile/names',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ProfileValidator.updateNames(),
  ValidatorUtil.handleValidationErrors,
  ProfileController.updateNames
);

/** DELETE /person/profile/delete-account */
router.delete(
  '/person/profile/delete-account',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ProfileValidator.deleteAccount(),
  ValidatorUtil.handleValidationErrors,
  ProfileController.deleteAccount
);

export default router;
