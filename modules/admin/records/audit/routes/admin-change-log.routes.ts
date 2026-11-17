import express = require('express');
const router = express.Router();
import ChangeLogController = require('../controllers/admin-change-log.controller');
import ChangeLogValidator = require('../validators/admin-change-log.validator');
import AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
import RbacMiddleware = require('../../../../../shared/middlewares/rbac.middleware');
import RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
import RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
import ValidatorUtil = require('../../../../../shared/utils/validators.util');
import AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
import constantsModule = require('../../../../../shared/constants');
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

export = router;
