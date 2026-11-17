// modules/client/kyc/routes/person-reference.routes.ts

import express from 'express';
const router = express.Router();
import PersonReferenceController from '../controllers/person-reference.controller';
import PersonReferenceValidator from '../validators/person-reference.validator';
import AuthMiddleware from '../../../../../shared/middlewares/auth.middleware';
import RateLimitMiddleware from '../../../../../shared/middlewares/rate-limit.middleware';
import RequestLockMiddleware from '../../../../../shared/middlewares/request-lock.middleware';
import ValidatorUtil from '../../../../../shared/utils/validators.util';
import AuditAction from '../../../../../shared/middlewares/audit-action.middleware';
import constantsModule from '../../../../../shared/constants';
const { CLIENT_ACCESS_ROLES } = constantsModule;

router.get(
  '/person/person-references',
  AuthMiddleware.requireRole(CLIENT_ACCESS_ROLES),
  RateLimitMiddleware.apiLimiter(),
  AuditAction.declare('PROFILE_REFERENCES_VIEWED', { entityType: 'PersonReference', entityTable: 'person_references' }),
  PersonReferenceController.list
);

router.post(
  '/person/person-references',
  AuthMiddleware.requireRole(CLIENT_ACCESS_ROLES),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  PersonReferenceValidator.create(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PROFILE_REFERENCE_CREATED', { entityType: 'PersonReference', entityTable: 'person_references' }),
  PersonReferenceController.create
);

router.put(
  '/person/person-references/:referenceId',
  AuthMiddleware.requireRole(CLIENT_ACCESS_ROLES),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  PersonReferenceValidator.update(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PROFILE_REFERENCE_UPDATED', { entityType: 'PersonReference', entityTable: 'person_references' }),
  PersonReferenceController.update
);

router.delete(
  '/person/person-references/:referenceId',
  AuthMiddleware.requireRole(CLIENT_ACCESS_ROLES),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  PersonReferenceValidator.remove(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PROFILE_REFERENCE_DELETED', { entityType: 'PersonReference', entityTable: 'person_references' }),
  PersonReferenceController.remove
);

export default router;
