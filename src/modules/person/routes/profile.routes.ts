import express from 'express';
const router = express.Router();
import ProfileController from '../controllers/profile.controller';
import ProfileValidator from '../validators/profile.validator';
import AuthMiddleware from '../../iam/middlewares/auth.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import AuditAction from '../../audit/middlewares/audit-action.middleware';

/**
 * TODAS LAS RUTAS REQUIEREN AUTENTICACIÓN
 */

/** GET /profile */
router.get(
  '/person/profile',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuditAction.declare('PROFILE_VIEWED', { entityType: 'User', entityTable: 'users' }),
  ProfileController.getProfile
);

/** GET /person/profile/extended */
router.get(
  '/person/profile/extended',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuditAction.declare('PROFILE_EXTENDED_VIEWED', { entityType: 'User', entityTable: 'users' }),
  ProfileController.getExtendedProfile
);

/** GET /person/profile/location */
router.get(
  '/person/profile/location',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuditAction.declare('PROFILE_LOCATION_VIEWED', { entityType: 'User', entityTable: 'users' }),
  ProfileController.getLocation
);

/** GET /person/profile/contact */
router.get(
  '/person/profile/contact',
  AuthMiddleware.authenticate,
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuditAction.declare('PROFILE_CONTACT_VIEWED', { entityType: 'User', entityTable: 'users' }),
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
  AuditAction.declare('PROFILE_UPDATED', { entityType: 'User', entityTable: 'users' }),
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
  AuditAction.declare('PROFILE_EMAIL_UPDATED', { entityType: 'User', entityTable: 'users' }),
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
  AuditAction.declare('PROFILE_PHONE_UPDATED', { entityType: 'User', entityTable: 'users' }),
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
  AuditAction.declare('PASSWORD_CHANGED', { entityType: 'User', entityTable: 'users' }),
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
  AuditAction.declare('PROFILE_UPDATED', { entityType: 'User', entityTable: 'users' }),
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
  AuditAction.declare('ACCOUNT_DELETED', { entityType: 'User', entityTable: 'users' }),
  ProfileController.deleteAccount
);

export default router;
