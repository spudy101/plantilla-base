const express = require('express');
const router = express.Router();
const ChangeLogController = require('../controllers/admin-change-log.controller');
const ChangeLogValidator = require('../validators/admin-change-log.validator');
const AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
const RbacMiddleware = require('../../../../../shared/middlewares/rbac.middleware');
const RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
const ValidatorUtil = require('../../../../../shared/utils/validators.util');
const AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('../../../../../shared/constants');

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

module.exports = router;
