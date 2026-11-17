import express = require('express');
const router = express.Router();
import ConsentTypeController = require('../controllers/consent-type.controller');
import ConsentTypeValidator = require('../validators/consent-type.validator');
import AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
import RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
import RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
import RbacMiddleware = require('../../../../../shared/middlewares/rbac.middleware');
import ValidatorUtil = require('../../../../../shared/utils/validators.util');
import AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
import rbacModule = require('../../../../../shared/constants/rbac');
const { RBAC_MODULES, RBAC_ACTIONS } = rbacModule;

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

export = router;
