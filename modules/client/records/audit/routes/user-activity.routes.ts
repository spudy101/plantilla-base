import express = require('express');
const router = express.Router();
import UserActivityController = require('../controllers/user-activity.controller');
import UserActivityValidator = require('../validators/user-activity.validator');
import AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
import RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
import ValidatorUtil = require('../../../../../shared/utils/validators.util');
import AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
import constantsModule = require('../../../../../shared/constants');
const { CLIENT_ACCESS_ROLES } = constantsModule;

// Feed de actividad reciente del PROPIO usuario (client-safe). Lectura: sin request lock.
router.get(
  '/audit/recent-activity',
  AuthMiddleware.requireRole(CLIENT_ACCESS_ROLES),
  RateLimitMiddleware.apiLimiter(),
  UserActivityValidator.list(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('RECENT_ACTIVITY_VIEWED', { entityType: 'AuditLog', entityTable: 'audit_logs' }),
  UserActivityController.list
);

export = router;
