// modules/client/kyc/routes/person-reference.routes.js

const express = require('express');
const router = express.Router();
const PersonReferenceController = require('../controllers/person-reference.controller');
const PersonReferenceValidator = require('../validators/person-reference.validator');
const AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
const RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
const ValidatorUtil = require('../../../../../shared/utils/validators.util');
const AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
const { CLIENT_ACCESS_ROLES } = require('../../../../../shared/constants');

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

module.exports = router;
