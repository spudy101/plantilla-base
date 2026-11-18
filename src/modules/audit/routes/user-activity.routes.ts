import express from 'express';
const router = express.Router();
import UserActivityController from '../controllers/user-activity.controller';
import UserActivityValidator from '../validators/user-activity.validator';
import iamModule from '../../iam';
const { AuthMiddleware } = iamModule;
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import constantsModule from '../../../shared/constants';
const { CLIENT_ACCESS_ROLES } = constantsModule;

// Feed de actividad reciente del PROPIO usuario (client-safe). Lectura: sin request lock.
router.get(
  '/audit/recent-activity',
  AuthMiddleware.requireRole(CLIENT_ACCESS_ROLES),
  RateLimitMiddleware.apiLimiter(),
  UserActivityValidator.list(),
  ValidatorUtil.handleValidationErrors,
  UserActivityController.list
);

export default router;
