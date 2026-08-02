const express = require('express');
const router = express.Router();
const ApprovalRequestController = require('../controllers/approval-request.controller');
const ApprovalRequestValidator = require('../validators/approval-request.validator');
const AuthMiddleware = require('../../../../shared/middlewares/auth.middleware');
const RbacMiddleware = require('../../../../shared/middlewares/rbac.middleware');
const RateLimitMiddleware = require('../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../shared/middlewares/request-lock.middleware');
const ValidatorUtil = require('../../../../shared/utils/validators.util');
const AuditAction = require('../../../../shared/middlewares/audit-action.middleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('../../../../shared/constants/rbac');

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

module.exports = router;
