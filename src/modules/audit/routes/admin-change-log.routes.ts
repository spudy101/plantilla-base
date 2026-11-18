import express from 'express';
const router = express.Router();
import ChangeLogController from '../controllers/admin-change-log.controller';
import ChangeLogValidator from '../validators/admin-change-log.validator';
import iamModule from '../../iam';
const { AuthMiddleware, RbacMiddleware } = iamModule;
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import constantsModule from '../../../shared/constants';
const { RBAC_MODULES, RBAC_ACTIONS } = constantsModule;

router.get(
  '/audit/change-logs/users',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.USER_CHANGES, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ChangeLogValidator.listUserChangeLogsQuery(),
  ValidatorUtil.handleValidationErrors,
  ChangeLogController.listUserChangeLogs
);

export default router;
