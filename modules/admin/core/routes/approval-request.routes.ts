import express from 'express';
const router = express.Router();
import ApprovalRequestController from '../controllers/approval-request.controller';
import ApprovalRequestValidator from '../validators/approval-request.validator';
import AuthMiddleware from '../../../../shared/middlewares/auth.middleware';
import RbacMiddleware from '../../../../shared/middlewares/rbac.middleware';
import RateLimitMiddleware from '../../../../shared/middlewares/rate-limit.middleware';
import RequestLockMiddleware from '../../../../shared/middlewares/request-lock.middleware';
import ValidatorUtil from '../../../../shared/utils/validators.util';
import AuditAction from '../../../../shared/middlewares/audit-action.middleware';
import rbacModule from '../../../../shared/constants/rbac';
const { RBAC_MODULES, RBAC_ACTIONS } = rbacModule;

// ── GET /approval-requests/policy — ANTES de /:id para evitar colisión ───────
router.get(
  '/approval-requests/policy',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.DUAL_APPROVAL, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  AuditAction.declare('APPROVAL_POLICY_VIEWED', { entityType: 'ApprovalRequest', entityTable: 'approval_requests' }),
  ApprovalRequestController.getPolicy
);

// ── GET /approval-requests — listar ──────────────────────────────────────────
router.get(
  '/approval-requests',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.DUAL_APPROVAL, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ApprovalRequestValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('APPROVAL_REQUEST_LIST_VIEWED', { entityType: 'ApprovalRequest', entityTable: 'approval_requests' }),
  ApprovalRequestController.list
);

// ── GET /approval-requests/:id — detalle ─────────────────────────────────────
router.get(
  '/approval-requests/:id',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.DUAL_APPROVAL, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ApprovalRequestValidator.idParam(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('APPROVAL_REQUEST_VIEWED', { entityType: 'ApprovalRequest', entityTable: 'approval_requests' }),
  ApprovalRequestController.getById
);

// ── POST /approval-requests/:id/resolve — aprobar / rechazar ─────────────────
// RBAC base APPROVALS.UPDATE; el service valida approverRoles del registro + segregación de funciones.
router.post(
  '/approval-requests/:id/resolve',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.DUAL_APPROVAL, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  ApprovalRequestValidator.resolve(),
  ValidatorUtil.handleValidationErrors,
  ApprovalRequestController.resolve
);

export default router;
