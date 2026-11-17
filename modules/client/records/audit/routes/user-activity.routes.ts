import express from 'express';
const router = express.Router();
import UserActivityController from '../controllers/user-activity.controller';
import UserActivityValidator from '../validators/user-activity.validator';
import AuthMiddleware from '../../../../../shared/middlewares/auth.middleware';
import RateLimitMiddleware from '../../../../../shared/middlewares/rate-limit.middleware';
import ValidatorUtil from '../../../../../shared/utils/validators.util';
import AuditAction from '../../../../../shared/middlewares/audit-action.middleware';
import constantsModule from '../../../../../shared/constants';
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

export default router;
