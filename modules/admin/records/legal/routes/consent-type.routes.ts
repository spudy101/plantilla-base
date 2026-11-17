import express from 'express';
const router = express.Router();
import ConsentTypeController from '../controllers/consent-type.controller';
import ConsentTypeValidator from '../validators/consent-type.validator';
import AuthMiddleware from '../../../../../shared/middlewares/auth.middleware';
import RateLimitMiddleware from '../../../../../shared/middlewares/rate-limit.middleware';
import RequestLockMiddleware from '../../../../../shared/middlewares/request-lock.middleware';
import RbacMiddleware from '../../../../../shared/middlewares/rbac.middleware';
import ValidatorUtil from '../../../../../shared/utils/validators.util';
import AuditAction from '../../../../../shared/middlewares/audit-action.middleware';
import rbacModule from '../../../../../shared/constants/rbac';
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

export default router;
