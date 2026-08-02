const express = require('express');
const router = express.Router();
const UserActivityController = require('../controllers/user-activity.controller');
const UserActivityValidator = require('../validators/user-activity.validator');
const AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
const RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
const ValidatorUtil = require('../../../../../shared/utils/validators.util');
const AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
const { CLIENT_ACCESS_ROLES } = require('../../../../../shared/constants');

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

module.exports = router;
