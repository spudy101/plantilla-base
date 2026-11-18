import express from 'express';
const router = express.Router();
import ChangeLogController from '../controllers/admin-change-log.controller';
import ChangeLogValidator from '../validators/admin-change-log.validator';
import AuthMiddleware from '../../iam/middlewares/auth.middleware';
import RbacMiddleware from '../../iam/middlewares/rbac.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import AuditAction from '../middlewares/audit-action.middleware';
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
  AuditAction.declare('CHANGE_LOG_VIEWED', { entityType: 'AuditRecord' }),
  ChangeLogController.listUserChangeLogs
);

export default router;
