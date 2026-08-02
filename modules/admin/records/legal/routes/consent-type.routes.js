const express = require('express');
const router = express.Router();
const ConsentTypeController = require('../controllers/consent-type.controller');
const ConsentTypeValidator = require('../validators/consent-type.validator');
const AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
const RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
const RbacMiddleware = require('../../../../../shared/middlewares/rbac.middleware');
const ValidatorUtil = require('../../../../../shared/utils/validators.util');
const AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('../../../../../shared/constants/rbac');

router.get(
  '/legal/consent-types',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.CONSENT_TYPES, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ConsentTypeValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('CONSENT_TYPE_LIST_VIEWED', { entityType: 'ConsentType', entityTable: 'consent_types' }),
  ConsentTypeController.list
);

router.get(
  '/legal/consent-types/:consentTypeId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.CONSENT_TYPES, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ConsentTypeValidator.idParam(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('CONSENT_TYPE_DETAIL_VIEWED', { entityType: 'ConsentType', entityTable: 'consent_types' }),
  ConsentTypeController.getById
);

router.post(
  '/legal/consent-types',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.CONSENT_TYPES, RBAC_ACTIONS.CREATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ConsentTypeValidator.create(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('CONSENT_TYPE_CREATED', { entityType: 'ConsentType', entityTable: 'consent_types' }),
  ConsentTypeController.create
);

router.patch(
  '/legal/consent-types/:consentTypeId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.CONSENT_TYPES, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ConsentTypeValidator.update(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('CONSENT_TYPE_UPDATED', { entityType: 'ConsentType', entityTable: 'consent_types' }),
  ConsentTypeController.update
);

module.exports = router;
