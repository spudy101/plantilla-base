// modules/client/kyc/routes/person-reference.routes.ts

import express from 'express';
const router = express.Router();
import PersonReferenceController from '../controllers/person-reference.controller';
import PersonReferenceValidator from '../validators/person-reference.validator';
import AuthMiddleware from '../../iam/middlewares/auth.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import constantsModule from '../../../shared/constants';
const { CLIENT_ACCESS_ROLES } = constantsModule;

router.get(
  '/person/person-references',
  AuthMiddleware.requireRole(CLIENT_ACCESS_ROLES),
  RateLimitMiddleware.apiLimiter(),
  PersonReferenceController.list
);

router.post(
  '/person/person-references',
  AuthMiddleware.requireRole(CLIENT_ACCESS_ROLES),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  PersonReferenceValidator.create(),
  ValidatorUtil.handleValidationErrors,
  PersonReferenceController.create
);

router.put(
  '/person/person-references/:referenceId',
  AuthMiddleware.requireRole(CLIENT_ACCESS_ROLES),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  PersonReferenceValidator.update(),
  ValidatorUtil.handleValidationErrors,
  PersonReferenceController.update
);

router.delete(
  '/person/person-references/:referenceId',
  AuthMiddleware.requireRole(CLIENT_ACCESS_ROLES),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  PersonReferenceValidator.remove(),
  ValidatorUtil.handleValidationErrors,
  PersonReferenceController.remove
);

export default router;
