// modules/admin/privacy-policy/routes/privacy-policy-admin.routes.js

const express = require('express');
const router = express.Router();
const PrivacyPolicyAdminController = require('../controllers/privacy-policy-admin.controller');
const PrivacyPolicyAdminValidator = require('../validators/privacy-policy-admin.validator');
const BaseValidator = require('../../../../../shared/validators/base.validator');
const AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
const RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../../shared/middlewares/request-lock.middleware');
const RbacMiddleware = require('../../../../../shared/middlewares/rbac.middleware');
const UploadMiddleware = require('../../../../../shared/middlewares/upload.middleware');
const ValidatorUtil = require('../../../../../shared/utils/validators.util');
const AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('../../../../../shared/constants/rbac');

/**
 * GET /admin/api/privacy-policies
 * Lista paginada de versiones de política de privacidad.
 */
router.get(
  '/legal/privacy-policies',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.PRIVACY_POLICIES, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  PrivacyPolicyAdminValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PRIVACY_POLICY_LIST_VIEWED', { entityType: 'PrivacyPolicy', entityTable: 'privacy_policies' }),
  PrivacyPolicyAdminController.listVersions
);

/**
 * GET /admin/api/privacy-policies/:privacyPolicyId
 * Detalle de una versión — incluye document_url (URL pública del PDF en CloudFront).
 */
router.get(
  '/legal/privacy-policies/:privacyPolicyId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.PRIVACY_POLICIES, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('privacyPolicyId', 'La política de privacidad'),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PRIVACY_POLICY_DETAIL_VIEWED', { entityType: 'PrivacyPolicy', entityTable: 'privacy_policies' }),
  PrivacyPolicyAdminController.getVersionDetail
);

/**
 * POST /admin/api/privacy-policies
 * Publica una nueva versión de la política.
 * Content-Type: multipart/form-data
 *
 * Body:
 *   policyDocument  (PDF, requerido)    — campo del archivo
 *   version         (string, requerido) — ej: "1.1", "2.0"
 *   summary         (string, opcional)  — resumen de cambios
 *   effectiveDate   (ISO 8601, opcional) — fecha de vigencia (default: ahora)
 */
router.post(
  '/legal/privacy-policies',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.PRIVACY_POLICIES, RBAC_ACTIONS.CREATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  UploadMiddleware.uploadFields([{ name: 'policyDocument', maxCount: 1 }], {
    maxFileSize: UploadMiddleware.MAX_DOCUMENT_SIZE
  }),
  UploadMiddleware.handleMulterError,
  PrivacyPolicyAdminValidator.createVersion(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('PRIVACY_POLICY_VERSION_CREATED', { entityType: 'PrivacyPolicy', entityTable: 'privacy_policies' }),
  PrivacyPolicyAdminController.createVersion
);

module.exports = router;
