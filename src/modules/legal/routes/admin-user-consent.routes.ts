import express from 'express';
const router = express.Router();
import AdminUserConsentController from '../controllers/admin-user-consent.controller';
import AdminUserConsentValidator from '../validators/admin-user-consent.validator';
import AuthMiddleware from '../../iam/middlewares/auth.middleware';
import RbacMiddleware from '../../iam/middlewares/rbac.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import constantsModule from '../../../shared/constants';
const { RBAC_MODULES, RBAC_ACTIONS } = constantsModule;

router.get(
  '/legal/user-consents',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.POLICY_ACCEPTANCE, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminUserConsentValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  AdminUserConsentController.list
);

router.get(
  '/legal/user-consents/users/:userId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.POLICY_ACCEPTANCE, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AdminUserConsentValidator.userId(),
  ValidatorUtil.handleValidationErrors,
  AdminUserConsentController.getHistoryByUser
);

export default router;
