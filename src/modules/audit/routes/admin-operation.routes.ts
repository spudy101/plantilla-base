// Traza de operaciones (admin, solo lectura). Mismo permiso RBAC que los logs de auditoría (GLOBAL_LOGS).
import express from 'express';
const router = express.Router();
import AdminOperationController from '../controllers/admin-operation.controller';
import AdminOperationValidator from '../validators/admin-operation.validator';
import AuthMiddleware from '../../iam/middlewares/auth.middleware';
import RbacMiddleware from '../../iam/middlewares/rbac.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import constantsModule from '../../../shared/constants';
const { RBAC_MODULES, RBAC_ACTIONS } = constantsModule;

const guards = [
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.GLOBAL_LOGS, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers()
];

router.get('/audit/operations', ...guards, AdminOperationValidator.list(), ValidatorUtil.handleValidationErrors, AdminOperationController.list);

router.get(
  '/audit/operations/:operationId',
  ...guards,
  AdminOperationValidator.timeline(),
  ValidatorUtil.handleValidationErrors,
  AdminOperationController.timeline
);

export default router;
